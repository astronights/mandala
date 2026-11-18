/**
 * A small, forward-only SQL migration runner.
 *
 * - Migrations are plain `.sql` files in db/migrations named `NNNN_name.sql`
 *   and run in numeric order.
 * - Each runs in its own transaction, together with its bookkeeping row, so a
 *   failure leaves nothing half-applied. A file whose first line is
 *   `-- migrate:no-transaction` runs outside one (for CREATE INDEX CONCURRENTLY).
 * - Applied migrations are recorded with a SHA-256 checksum. Editing a file
 *   after it has been applied is refused: write a new migration instead.
 * - A Postgres advisory lock stops two deploys from migrating at once.
 *
 * The runner talks to the database through `SqlClient`, so it works with
 * node-postgres against Neon and with PGlite in tests.
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SqlClient {
  /** One statement, with optional $1-style parameters. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** One or more statements, no parameters. */
  exec(sql: string): Promise<void>;
}

export interface Migration {
  id: number;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
  transactional: boolean;
}

export interface AppliedMigration {
  id: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

export type MigrationState = "applied" | "pending" | "changed" | "missing";

export interface StatusEntry {
  id: number;
  name: string;
  state: MigrationState;
  appliedAt?: Date;
}

export const MIGRATIONS_TABLE = "schema_migrations";
/** Arbitrary constant: "mandala" on a phone keypad. */
export const LOCK_KEY = 6263252;

const FILENAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const NO_TRANSACTION = /^\s*--\s*migrate:no-transaction\b/;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export function checksum(sql: string): string {
  // Normalise line endings so a Windows checkout doesn't look "changed".
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function parseMigration(filename: string, sql: string): Migration {
  const match = FILENAME.exec(filename);
  if (!match) {
    throw new MigrationError(
      `Bad migration filename "${filename}": expected NNNN_snake_case_name.sql`,
    );
  }
  if (!sql.trim()) throw new MigrationError(`Migration ${filename} is empty`);
  return {
    id: Number(match[1]),
    name: match[2],
    filename,
    sql,
    checksum: checksum(sql),
    transactional: !NO_TRANSACTION.test(sql),
  };
}

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const migrations = await Promise.all(
    files.map(async (f) => parseMigration(f, await readFile(path.join(dir, f), "utf8"))),
  );
  validateSequence(migrations);
  return migrations;
}

export function validateSequence(migrations: Migration[]): void {
  const seen = new Map<number, string>();
  for (const m of migrations) {
    const other = seen.get(m.id);
    if (other)
      throw new MigrationError(`Duplicate migration number ${m.id}: ${other}, ${m.filename}`);
    seen.set(m.id, m.filename);
  }
  const ids = [...seen.keys()].sort((a, b) => a - b);
  ids.forEach((id, i) => {
    if (id !== i + 1) {
      throw new MigrationError(
        `Migration numbers must run 0001, 0002, … without gaps (found ${id})`,
      );
    }
  });
}

export function nextFilename(existing: Migration[], name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) throw new MigrationError("Give the migration a name, e.g. add_streaks");
  const next = existing.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  return `${String(next).padStart(4, "0")}_${slug}.sql`;
}

async function ensureTable(db: SqlClient): Promise<void> {
  await db.exec(`
    create table if not exists ${MIGRATIONS_TABLE} (
      id         integer primary key,
      name       text not null,
      checksum   char(64) not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function applied(db: SqlClient): Promise<AppliedMigration[]> {
  const { rows } = await db.query<AppliedMigration>(
    `select id, name, checksum, applied_at from ${MIGRATIONS_TABLE} order by id`,
  );
  return rows;
}

export async function status(db: SqlClient, migrations: Migration[]): Promise<StatusEntry[]> {
  await ensureTable(db);
  const done = new Map((await applied(db)).map((a) => [a.id, a]));
  const out: StatusEntry[] = migrations.map((m) => {
    const a = done.get(m.id);
    if (!a) return { id: m.id, name: m.name, state: "pending" };
    return {
      id: m.id,
      name: m.name,
      state: a.checksum === m.checksum ? "applied" : "changed",
      appliedAt: a.applied_at,
    };
  });
  const known = new Set(migrations.map((m) => m.id));
  for (const a of done.values()) {
    if (!known.has(a.id)) {
      out.push({ id: a.id, name: a.name, state: "missing", appliedAt: a.applied_at });
    }
  }
  return out.sort((x, y) => x.id - y.id);
}

export interface MigrateOptions {
  log?: (line: string) => void;
}

/** Apply every pending migration. Returns the ones applied this run. */
export async function migrate(
  db: SqlClient,
  migrations: Migration[],
  { log = () => {} }: MigrateOptions = {},
): Promise<Migration[]> {
  validateSequence(migrations);
  await db.query("select pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    const entries = await status(db, migrations);

    const changed = entries.filter((e) => e.state === "changed");
    if (changed.length) {
      throw new MigrationError(
        `Applied migrations were edited: ${changed.map((e) => `${pad(e.id)}_${e.name}`).join(", ")}. ` +
          "Restore the original files and put the change in a new migration.",
      );
    }
    const missing = entries.filter((e) => e.state === "missing");
    if (missing.length) {
      throw new MigrationError(
        `The database has migrations this code doesn't: ${missing.map((e) => pad(e.id)).join(", ")}. ` +
          "Deploy the newer code, or restore the missing files.",
      );
    }

    const pending = migrations.filter(
      (m) => entries.find((e) => e.id === m.id)?.state === "pending",
    );
    if (!pending.length) {
      log("Database is up to date.");
      return [];
    }

    for (const m of pending) {
      const started = Date.now();
      log(`→ ${m.filename}`);
      await applyOne(db, m);
      log(`  done in ${Date.now() - started} ms`);
    }
    log(`Applied ${pending.length} migration${pending.length === 1 ? "" : "s"}.`);
    return pending;
  } finally {
    await db.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

async function applyOne(db: SqlClient, m: Migration): Promise<void> {
  const record = () =>
    db.query(`insert into ${MIGRATIONS_TABLE} (id, name, checksum) values ($1, $2, $3)`, [
      m.id,
      m.name,
      m.checksum,
    ]);

  if (!m.transactional) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw wrap(m, e);
    }
    await record();
    return;
  }

  await db.exec("begin");
  try {
    await db.exec(m.sql);
    await record();
    await db.exec("commit");
  } catch (e) {
    await db.exec("rollback");
    throw wrap(m, e);
  }
}

function wrap(m: Migration, e: unknown): MigrationError {
  const reason = e instanceof Error ? e.message : String(e);
  const outcome = m.transactional
    ? "was rolled back"
    : "ran outside a transaction, so check for partial changes";
  return new MigrationError(`${m.filename} failed and ${outcome}: ${reason}`);
}

const pad = (id: number) => String(id).padStart(4, "0");
