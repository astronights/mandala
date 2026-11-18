import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checksum,
  loadMigrations,
  LOCK_KEY,
  migrate,
  MigrationError,
  MIGRATIONS_TABLE,
  nextFilename,
  parseMigration,
  status,
  validateSequence,
  type Migration,
} from "./migrator.ts";
import { memoryDb } from "./testing.ts";

const m = (filename: string, sql: string) => parseMigration(filename, sql);

describe("parseMigration", () => {
  it("reads the number and name", () => {
    const mig = m("0003_add_streaks.sql", "create table t ();");
    expect(mig).toMatchObject({ id: 3, name: "add_streaks", transactional: true });
    expect(mig.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(["1_x.sql", "0001-x.sql", "0001_X.sql", "0001_.sql", "abcd_x.sql", "0001_x.txt"])(
    "rejects the filename %s",
    (f) => {
      expect(() => m(f, "select 1")).toThrow(MigrationError);
    },
  );

  it("rejects empty files", () => {
    expect(() => m("0001_x.sql", "  \n")).toThrow(/empty/);
  });

  it("detects the no-transaction marker on the first line only", () => {
    expect(m("0001_x.sql", "-- migrate:no-transaction\nselect 1").transactional).toBe(false);
    expect(m("0001_x.sql", "select 1\n-- migrate:no-transaction").transactional).toBe(true);
  });
});

describe("checksum", () => {
  it("ignores CRLF vs LF but not real edits", () => {
    expect(checksum("a\r\nb")).toBe(checksum("a\nb"));
    expect(checksum("a\nb")).not.toBe(checksum("a\nc"));
  });
});

describe("validateSequence and nextFilename", () => {
  it("accepts 1..n and rejects duplicates and gaps", () => {
    expect(() => validateSequence([m("0001_a.sql", "x"), m("0002_b.sql", "x")])).not.toThrow();
    expect(() => validateSequence([m("0001_a.sql", "x"), m("0001_b.sql", "x")])).toThrow(
      /Duplicate/,
    );
    expect(() => validateSequence([m("0001_a.sql", "x"), m("0003_b.sql", "x")])).toThrow(/gaps/);
    expect(() => validateSequence([m("0002_a.sql", "x")])).toThrow(/gaps/);
  });

  it("numbers and slugifies new migrations", () => {
    expect(nextFilename([], "Initial schema")).toBe("0001_initial_schema.sql");
    expect(nextFilename([m("0001_a.sql", "x"), m("0002_b.sql", "x")], " add-Streaks! ")).toBe(
      "0003_add_streaks.sql",
    );
    expect(() => nextFilename([], "  !! ")).toThrow(/name/);
  });
});

describe("loadMigrations", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("loads .sql files in order and ignores other files", async () => {
    await writeFile(path.join(dir, "0002_b.sql"), "select 2");
    await writeFile(path.join(dir, "0001_a.sql"), "select 1");
    await writeFile(path.join(dir, "README.md"), "notes");
    expect((await loadMigrations(dir)).map((x) => x.filename)).toEqual([
      "0001_a.sql",
      "0002_b.sql",
    ]);
  });

  it("loads the real migrations", async () => {
    const real = await loadMigrations(path.join(import.meta.dirname, "migrations"));
    expect(real.length).toBeGreaterThan(0);
    expect(real[0].filename).toBe("0001_initial_schema.sql");
  });
});

describe("migrate", () => {
  let db: Awaited<ReturnType<typeof memoryDb>>;
  beforeEach(async () => {
    db = await memoryDb();
  });
  afterEach(() => db.close());

  const one = m("0001_one.sql", "create table one (id int primary key);");
  const two = m(
    "0002_two.sql",
    "create table two (id int primary key);\ninsert into two values (1);",
  );

  const tables = async () =>
    (
      await db.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' order by 1",
      )
    ).rows.map((r) => r.table_name);

  it("applies pending migrations in order and records them", async () => {
    const lines: string[] = [];
    const applied = await migrate(db, [one, two], { log: (l) => lines.push(l) });
    expect(applied.map((x) => x.id)).toEqual([1, 2]);
    expect(await tables()).toEqual(["one", MIGRATIONS_TABLE, "two"]);
    expect(lines.at(-1)).toBe("Applied 2 migrations.");
    const rows = (await db.query(`select id, name, checksum from ${MIGRATIONS_TABLE} order by id`))
      .rows;
    expect(rows).toEqual([
      { id: 1, name: "one", checksum: one.checksum },
      { id: 2, name: "two", checksum: two.checksum },
    ]);
  });

  it("is a no-op when up to date, and picks up only new files later", async () => {
    await migrate(db, [one]);
    const lines: string[] = [];
    expect(await migrate(db, [one], { log: (l) => lines.push(l) })).toEqual([]);
    expect(lines).toEqual(["Database is up to date."]);
    expect((await migrate(db, [one, two])).map((x) => x.id)).toEqual([2]);
  });

  it("reports status for applied, pending, changed and missing migrations", async () => {
    expect((await status(db, [one, two])).map((e) => e.state)).toEqual(["pending", "pending"]);
    await migrate(db, [one, two]);
    const edited = m("0002_two.sql", "create table two (id bigint primary key);");
    const entries = await status(db, [one, edited]);
    expect(entries.map((e) => e.state)).toEqual(["applied", "changed"]);
    expect(entries[0].appliedAt).toBeInstanceOf(Date);
    expect((await status(db, [one])).map((e) => e.state)).toEqual(["applied", "missing"]);
  });

  it("refuses to run when an applied migration was edited", async () => {
    await migrate(db, [one]);
    const edited = m("0001_one.sql", "create table one (id bigint primary key);");
    await expect(migrate(db, [edited, two])).rejects.toThrow(/were edited: 0001_one/);
    expect(await tables()).not.toContain("two");
  });

  it("refuses to run when the database is ahead of the code", async () => {
    await migrate(db, [one, two]);
    await expect(migrate(db, [one])).rejects.toThrow(/doesn't: 0002/);
  });

  it("rolls back a failing migration completely and keeps earlier ones", async () => {
    const bad = m("0002_bad.sql", "create table half (id int);\nselect * from does_not_exist;");
    await expect(migrate(db, [one, bad])).rejects.toThrow(
      /0002_bad.sql failed and was rolled back/,
    );
    expect(await tables()).toEqual(["one", MIGRATIONS_TABLE]);
    expect((await status(db, [one, bad])).map((e) => e.state)).toEqual(["applied", "pending"]);
  });

  it("runs no-transaction migrations outside a transaction", async () => {
    const concurrent = m(
      "0002_idx.sql",
      "-- migrate:no-transaction\ncreate index concurrently one_id_idx on one (id);",
    );
    await migrate(db, [one, concurrent]);
    const idx = await db.query("select 1 from pg_indexes where indexname = 'one_id_idx'");
    expect(idx.rows).toHaveLength(1);
  });

  it("reports failures in no-transaction migrations honestly", async () => {
    const bad = m("0002_bad.sql", "-- migrate:no-transaction\nselect * from nope;");
    await expect(migrate(db, [one, bad])).rejects.toThrow(/outside a transaction/);
  });

  it("validates numbering before touching the database", async () => {
    await expect(migrate(db, [m("0002_x.sql", "select 1")])).rejects.toThrow(/gaps/);
    expect(await tables()).toEqual([]);
  });

  it("releases its advisory lock, even after a failure", async () => {
    const heldLocks = async () =>
      (
        await db.query(
          "select 1 from pg_locks where locktype = 'advisory' and objid = $1 and granted",
          [LOCK_KEY],
        )
      ).rows.length;
    await migrate(db, [one]);
    expect(await heldLocks()).toBe(0);
    const bad: Migration = m("0002_bad.sql", "nonsense;");
    await expect(migrate(db, [one, bad])).rejects.toThrow();
    expect(await heldLocks()).toBe(0);
  });
});
