import type { Db } from "@/lib/db/client";

/**
 * After MAX_FAILURES wrong passcodes within WINDOW_MINUTES, sign-in is closed
 * until the oldest of those failures ages out. There is one admin, so the
 * limit is global rather than per visitor, and nothing about the visitor is
 * stored. A correct passcode clears the count.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;

export interface FailureStore {
  recentFailures(now: Date): Promise<Date[]>;
  recordFailure(now: Date): Promise<void>;
  clear(): Promise<void>;
}

const windowStart = (now: Date) => new Date(now.getTime() - WINDOW_MINUTES * 60_000);

export function dbFailureStore(db: Db): FailureStore {
  return {
    recentFailures: async (now) =>
      (
        await db.query<{ failed_at: Date | string }>(
          "select failed_at from admin_login_failures where failed_at > $1 order by failed_at",
          [windowStart(now).toISOString()],
        )
      ).map((r) => new Date(r.failed_at)),
    recordFailure: async (now) => {
      await db.transaction([
        {
          text: "insert into admin_login_failures (failed_at) values ($1)",
          params: [now.toISOString()],
        },
        // Keep the table tiny.
        {
          text: "delete from admin_login_failures where failed_at < $1",
          params: [new Date(now.getTime() - 24 * 3600_000).toISOString()],
        },
      ]);
    },
    clear: async () => {
      await db.query("delete from admin_login_failures");
    },
  };
}

/** Fallback without a database: per server instance only. */
export function memoryFailureStore(): FailureStore {
  let failures: Date[] = [];
  return {
    recentFailures: async (now) => failures.filter((f) => f > windowStart(now)),
    recordFailure: async (now) => {
      failures = [...failures.filter((f) => f > windowStart(now)), now];
    },
    clear: async () => {
      failures = [];
    },
  };
}

/** When sign-in reopens, or null if it's open now. */
export async function lockedUntil(store: FailureStore, now: Date): Promise<Date | null> {
  const recent = await store.recentFailures(now);
  if (recent.length < MAX_FAILURES) return null;
  const oldestCounted = recent[recent.length - MAX_FAILURES];
  return new Date(oldestCounted.getTime() + WINDOW_MINUTES * 60_000);
}
