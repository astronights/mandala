import { PGlite } from "@electric-sql/pglite";
import type { SqlClient } from "./migrator.ts";

/** An in-memory Postgres for tests. */
export async function memoryDb(): Promise<SqlClient & { pg: PGlite; close(): Promise<void> }> {
  const pg = await PGlite.create();
  return {
    pg,
    query: async <T>(sql: string, params?: unknown[]) => {
      const res = await pg.query<T>(sql, params);
      return { rows: res.rows };
    },
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
}

/** The app's Db interface over PGlite, with migrations applied. */
export async function migratedAppDb(): Promise<{
  db: import("../src/lib/db/client").Db;
  pg: PGlite;
  close(): Promise<void>;
}> {
  const { loadMigrations, migrate } = await import("./migrator.ts");
  const path = await import("node:path");
  const raw = await memoryDb();
  await migrate(raw, await loadMigrations(path.join(import.meta.dirname, "migrations")));
  const pg = raw.pg;
  return {
    pg,
    close: () => pg.close(),
    db: {
      query: async <T>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
      transaction: (statements) =>
        pg.transaction(async (tx) => {
          const out: Record<string, unknown>[][] = [];
          for (const s of statements) {
            out.push((await tx.query<Record<string, unknown>>(s.text, s.params ?? [])).rows);
          }
          return out;
        }),
    },
  };
}
