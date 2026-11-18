import { readJSON, writeJSON } from "./local";

/** Today's colouring, saved as the user goes so a refresh never loses work. */

export const STORAGE_VERSION = 1;

export interface DayProgress {
  v: number;
  date: string;
  /** region index -> palette index */
  fills: Record<string, number>;
  updatedAt: number;
}

export interface Preferences {
  v: number;
  /** Preferred lines of symmetry; Infinity-like values mean "full". */
  symmetry: number;
}

export const progressKey = (date: string) => `mandala:v${STORAGE_VERSION}:day:${date}`;
export const PREFS_KEY = `mandala:v${STORAGE_VERSION}:prefs`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function isDayProgress(v: unknown): v is DayProgress {
  if (!isRecord(v) || v.v !== STORAGE_VERSION || typeof v.date !== "string") return false;
  if (!isRecord(v.fills)) return false;
  return Object.entries(v.fills).every(
    ([k, n]) => /^\d+$/.test(k) && Number.isInteger(n) && (n as number) >= 0,
  );
}

export function isPreferences(v: unknown): v is Preferences {
  return isRecord(v) && v.v === STORAGE_VERSION && typeof v.symmetry === "number";
}

export function loadProgress(date: string): DayProgress | null {
  const p = readJSON(progressKey(date), isDayProgress);
  return p && p.date === date ? p : null;
}

export function saveProgress(date: string, fills: Record<string, number>): boolean {
  const value: DayProgress = { v: STORAGE_VERSION, date, fills, updatedAt: Date.now() };
  return writeJSON(progressKey(date), value);
}

export function loadPreferences(): Preferences | null {
  return readJSON(PREFS_KEY, isPreferences);
}

export function savePreferences(prefs: Omit<Preferences, "v">): boolean {
  return writeJSON(PREFS_KEY, { v: STORAGE_VERSION, ...prefs });
}
