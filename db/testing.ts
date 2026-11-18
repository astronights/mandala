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
