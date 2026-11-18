import type { Db } from "@/lib/db/client";
import { recordDays } from "./record";

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Every local "today" in the world right now: yesterday, today and tomorrow in UTC. */
export function liveDates(now: Date): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return [today - 86_400_000, today, today + 86_400_000].map(isoDay);
}

/**
 * GET /api/cron/record-day, called daily by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 * It records days even when nobody plays.
 */
export async function handleRecordDay(
  request: Request,
  db: Db | null,
  { secret = process.env.CRON_SECRET, now = new Date() }: { secret?: string; now?: Date } = {},
): Promise<Response> {
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return Response.json({ recorded: [], configured: false });
  try {
    return Response.json({ recorded: await recordDays(db, liveDates(now)) });
  } catch (e) {
    console.error("Failed to record days", e);
    return Response.json({ error: "Could not record" }, { status: 503 });
  }
}
