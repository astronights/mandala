import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { connect, migrationUrl } from "./pg.ts";

/**
 * Runs the real CLI with the real `pg` driver against a Postgres wire-protocol
 * server backed by PGlite: the same path `npm run db:migrate` takes on Neon.
 */

const run = promisify(execFile);
const ROOT = path.join(import.meta.dirname, "..");
const PORT = 55432 + Math.floor(Math.random() * 1000);
const URL = `postgres://postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;

let pg: PGlite;
let server: PGLiteSocketServer;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
  await server.start();
});
afterAll(async () => {
  await server.stop();
  await pg.close();
});

const cli = (...args: string[]) =>
  run("node", ["scripts/db.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL_UNPOOLED: "", DATABASE_URL: URL },
  });

describe("db CLI", () => {
  it("shows pending migrations, applies them, then reports up to date", async () => {
    const before = await cli("status");
    expect(before.stdout).toMatch(/· 0001_initial_schema {2}pending/);

    const first = await cli("migrate");
    expect(first.stdout).toContain("→ 0001_initial_schema.sql");

    const second = await cli("migrate");
    expect(second.stdout).toContain("Database is up to date.");

    const after = await cli("status");
    expect(after.stdout).toMatch(/✓ 0001_initial_schema {2}applied/);
  }, 30_000);

  it("fails clearly without a connection string", async () => {
    await expect(
      run("node", ["scripts/db.ts", "status"], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" },
      }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Set DATABASE_URL/) });
  });

  it("prints usage for unknown commands", async () => {
    await expect(cli("explode")).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringMatching(/Usage/),
    });
  });
});

describe("connect", () => {
  it("runs parameterised queries and multi-statement scripts over the pg driver", async () => {
    const db = await connect(URL);
    try {
      await db.exec("create temp table t (n int); insert into t values (1), (2);");
      const { rows } = await db.query<{ total: number }>(
        "select sum(n)::int + $1::int as total from t",
        [10],
      );
      expect(rows).toEqual([{ total: 13 }]);
    } finally {
      await db.close();
    }
  });
});

describe("migrationUrl", () => {
  it("prefers the unpooled URL that Neon's Vercel integration provides", () => {
    expect(migrationUrl({ DATABASE_URL: "pooled", DATABASE_URL_UNPOOLED: "direct" })).toBe(
      "direct",
    );
    expect(migrationUrl({ DATABASE_URL: "pooled" })).toBe("pooled");
    expect(() => migrationUrl({})).toThrow(/DATABASE_URL/);
  });
});
