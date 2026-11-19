import type { Db } from "@/lib/db/client";
import { liveDates } from "@/lib/day";
import { recordDays } from "./record";

export { liveDates };

/**
 * GET /api/cron/record-day, called daily by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 * It records the days that are live somewhere, even if nobody plays them,
 * and never a day that hasn't begun anywhere yet.
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
