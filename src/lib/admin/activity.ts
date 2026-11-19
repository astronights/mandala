import type { Db } from "@/lib/db/client";
import { adminMode, isAdmin, type AdminMode } from "./auth";

export interface DayActivity {
  date: string;
  version: number | null;
  symmetry: number | null;
  ringCount: number | null;
  pieceCount: number | null;
  paletteScheme: string | null;
  players: number;
  finishers: number;
  colourPlays: number;
  drawPlays: number;
  freePlays: number;
  avgActiveSeconds: number;
  avgProgress: number;
}

export interface ActivityReport {
  configured: true;
  from: string;
  to: string;
  totals: { devices: number; active1d: number; active7d: number; plays: number; finishes: number };
  daily: DayActivity[];
  symmetryUsage: { lines: number; plays: number }[];
  byFold: { symmetry: number; plays: number; finishes: number; avgActiveSeconds: number }[];
}

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 365;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Window of `days` ending tomorrow (UTC), covering every local "today". */
export function activityWindow(days: number, now: Date): { from: string; to: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = new Date(end.getTime() - days * 86_400_000);
  return { from: isoDay(start), to: isoDay(end) };
}

export async function loadActivity(
  db: Db,
  { days = DEFAULT_DAYS, now = new Date() }: { days?: number; now?: Date } = {},
): Promise<ActivityReport> {
  const { from, to } = activityWindow(days, now);
  const range = [from, to];

  // Casts keep results identical across drivers (bigint/numeric/date parsing).
  const [totals] = await db.query<ActivityReport["totals"]>(
    `select
       (select count(*)::int from devices)                                                  as devices,
       (select count(*)::int from devices where last_seen_at > now() - interval '1 day')    as "active1d",
       (select count(*)::int from devices where last_seen_at > now() - interval '7 days')   as "active7d",
       (select count(*)::int from plays where play_date between $1 and $2)                  as plays,
       (select count(*)::int from plays where play_date between $1 and $2
                                          and completed_at is not null)                     as finishes`,
    range,
  );

  const daily = await db.query<DayActivity>(
    `select play_date::text                as date,
            mandala_version::int           as version,
            symmetry::int                  as symmetry,
            ring_count::int                as "ringCount",
            piece_count::int               as "pieceCount",
            palette_scheme                 as "paletteScheme",
            players::int                   as players,
            finishers::int                 as finishers,
            colour_plays::int              as "colourPlays",
            draw_plays::int                as "drawPlays",
            free_plays::int                as "freePlays",
            avg_active_seconds::int        as "avgActiveSeconds",
            avg_progress::float8           as "avgProgress"
       from daily_overview
      where play_date between $1 and $2
      order by play_date desc`,
    range,
  );

  const symmetryUsage = await db.query<{ lines: number; plays: number }>(
    `select symmetry_lines::int as lines, sum(plays)::int as plays
       from symmetry_usage
      where play_date between $1 and $2
      group by symmetry_lines
      order by symmetry_lines`,
    range,
  );

  const byFold = await db.query<ActivityReport["byFold"][number]>(
    `select m.symmetry::int                             as symmetry,
            count(*)::int                               as plays,
            count(p.completed_at)::int                  as finishes,
            coalesce(round(avg(p.active_seconds)), 0)::int as "avgActiveSeconds"
       from plays p
       join daily_mandalas m on m.play_date = p.play_date
      where p.play_date between $1 and $2
      group by m.symmetry
      order by m.symmetry`,
    range,
  );

  return { configured: true, from, to, totals, daily, symmetryUsage, byFold };
}

/** GET /api/admin/activity?days=30 */
export async function handleActivity(
  request: Request,
  db: Db | null,
  { mode = adminMode(), now = new Date() }: { mode?: AdminMode; now?: Date } = {},
): Promise<Response> {
  // The proxy already gates this route; check again in case it's ever bypassed.
  if (!(await isAdmin(request, mode, now.getTime()))) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const headers = { "cache-control": "no-store" };
  if (!db) return Response.json({ configured: false }, { headers });

  const raw = Number(new URL(request.url).searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Number.isInteger(raw) ? Math.min(MAX_DAYS, Math.max(1, raw)) : DEFAULT_DAYS;
  try {
    return Response.json(await loadActivity(db, { days, now }), { headers });
  } catch (e) {
    console.error("Failed to load activity", e);
    return Response.json({ error: "Could not load activity" }, { status: 503, headers });
  }
}
