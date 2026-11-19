/** Time until the next local midnight, when a new mandala appears. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

/** "6h 12m", "12m", or "less than a minute". */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const isoUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Every date that is "today" somewhere right now. Local time runs from
 * UTC−12 to UTC+14, so these are the UTC dates of now−12h through now+14h:
 * never a day that hasn't started anywhere yet.
 */
export function liveDates(now: Date = new Date()): string[] {
  const t = now.getTime();
  return [...new Set([isoUtc(t - 12 * 3_600_000), isoUtc(t), isoUtc(t + 14 * 3_600_000)])];
}
