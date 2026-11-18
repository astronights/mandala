import { neon } from "@neondatabase/serverless";

/**
 * The app's database access, kept to two operations so it can be backed by
 * Neon's HTTP driver in production and by PGlite in tests.
 */

export interface Statement {
  text: string;
  params?: unknown[];
}

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs all statements in one transaction; returns each statement's rows. */
  transaction(statements: Statement[]): Promise<Record<string, unknown>[][]>;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
    transaction: async (statements) =>
      (await sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? [])))) as Record<
        string,
        unknown
      >[][],
  };
}

let cached: { url: string; db: Db } | null = null;

/** The configured database, or null when DATABASE_URL isn't set. */
export function getDb(env: Record<string, string | undefined> = process.env): Db | null {
  const url = env.DATABASE_URL;
  if (!url) return null;
  if (cached?.url !== url) cached = { url, db: neonDb(url) };
  return cached.db;
}
