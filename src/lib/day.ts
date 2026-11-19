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
