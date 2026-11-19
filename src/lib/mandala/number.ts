/**
 * Mandala numbers, like Wordle's: the first day is #1 and each day after
 * counts up. Everyone on the same local date sees the same number.
 */
export const FIRST_DAY = "2026-11-19";

const utcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** #1 for FIRST_DAY, #2 the day after; null for days before launch. */
export function mandalaNumber(date: string): number | null {
  const n = Math.round((utcDay(date) - utcDay(FIRST_DAY)) / 86_400_000) + 1;
  return n >= 1 ? n : null;
}
