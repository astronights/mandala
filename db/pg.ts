import pg from "pg";
import type { SqlClient } from "./migrator.ts";

/**
 * Migrations need a direct (unpooled) connection: advisory locks and
 * multi-statement scripts don't work reliably through PgBouncer. Neon's
 * Vercel integration sets DATABASE_URL_UNPOOLED for exactly this.
 */
export function migrationUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set DATABASE_URL_UNPOOLED (or DATABASE_URL) to your Neon connection string, e.g. in .env.local",
    );
  }
  return url;
}

export async function connect(url: string): Promise<SqlClient & { close(): Promise<void> }> {
  const client = new pg.Client({ connectionString: url, application_name: "mandala-migrate" });
  await client.connect();
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const res = await client.query(sql, params);
      return { rows: res.rows as T[] };
    },
    exec: async (sql: string) => {
      await client.query(sql);
    },
    close: () => client.end(),
  };
}
