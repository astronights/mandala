import type { Db, Statement } from "@/lib/db/client";
import { DEFAULT_SEED, MANDALA_VERSION } from "@/lib/mandala/generate";
import { summarizeDay } from "@/lib/mandala/summary";
import type { PlayReport } from "./report";

/** Ignore updates to the same play more often than this, unless it just finished. */
export const THROTTLE_SECONDS = 10;

/**
 * Records a day's mandala the first time it's seen. Recomputed on the server
 * from (date, seed, version): never from the client's description of it.
 */
export function dayStatement(date: string, version: number = MANDALA_VERSION): Statement {
  const day = summarizeDay(date, DEFAULT_SEED, version);
  return {
    text: `insert into daily_mandalas (play_date, mandala_version, seed, symmetry, ring_count,
                                       motifs, piece_count, group_count, palette_scheme, palette)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (play_date) do nothing
           returning 1 as recorded`,
    params: [
      day.date,
      day.version,
      day.seed,
      day.symmetry,
      day.ringCount,
      day.motifs,
      day.pieceCount,
      day.groupCount,
      day.paletteScheme,
      day.palette,
    ],
  };
}

/** Records several days' mandalas; returns the dates newly recorded. */
export async function recordDays(db: Db, dates: string[]): Promise<string[]> {
  const results = await db.transaction(dates.map((d) => dayStatement(d)));
  return dates.filter((_, i) => (results[i]?.length ?? 0) > 0);
}

/**
 * Store a play report: touch the device, record the day's mandala the first
 * time it's seen, and upsert the play. All in one transaction.
 *
 * - active time only grows (the client sends a running total);
 * - progress is the latest value (erasing can lower it);
 * - completion is sticky once set.
 *
 * Returns whether the play row was written (false when throttled).
 */
export async function recordPlay(
  db: Db,
  report: PlayReport,
  { throttleSeconds = THROTTLE_SECONDS }: { throttleSeconds?: number } = {},
): Promise<{ written: boolean }> {
  const results = await db.transaction([
    {
      text: `insert into devices (id) values ($1)
             on conflict (id) do update set last_seen_at = greatest(devices.last_seen_at, now())`,
      params: [report.deviceId],
    },
    dayStatement(report.date, report.version),
    {
      text: `insert into plays (device_id, play_date, mode, mandala_version, active_seconds,
                                progress, symmetry_lines, completed_at)
             values ($1, $2, $3, $4, $5, $6, $7, case when $8::boolean then now() end)
             on conflict (device_id, play_date, mode) do update set
               active_seconds = greatest(plays.active_seconds, excluded.active_seconds),
               progress       = excluded.progress,
               symmetry_lines = coalesce(excluded.symmetry_lines, plays.symmetry_lines),
               completed_at   = coalesce(plays.completed_at, excluded.completed_at),
               updated_at     = greatest(now(), plays.started_at)
             where plays.updated_at <= now() - make_interval(secs => $9::int)
                or (plays.completed_at is null and excluded.completed_at is not null)
             returning 1 as written`,
      params: [
        report.deviceId,
        report.date,
        report.mode,
        report.version,
        report.activeSeconds,
        report.progress,
        report.symmetryLines,
        report.completed,
        throttleSeconds,
      ],
    },
  ]);

  return { written: (results[2]?.length ?? 0) > 0 };
}
