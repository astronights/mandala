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

export type ColourMode = "guided" | "free";

export interface Preferences {
  v: number;
  /** Preferred lines of symmetry; Infinity-like values mean "full". */
  symmetry: number;
  /** Guided (the day's colours) or free colouring. */
  mode?: ColourMode;
}

/** Each mode keeps its own canvas, so switching never mixes them. */
export const progressKey = (date: string, mode: ColourMode = "guided") =>
  `mandala:v${STORAGE_VERSION}:day:${date}${mode === "free" ? ":free" : ""}`;
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
  return (
    isRecord(v) &&
    v.v === STORAGE_VERSION &&
    typeof v.symmetry === "number" &&
    (v.mode === undefined || v.mode === "guided" || v.mode === "free")
  );
}

export function loadProgress(date: string, mode: ColourMode = "guided"): DayProgress | null {
  const p = readJSON(progressKey(date, mode), isDayProgress);
  return p && p.date === date ? p : null;
}

export function saveProgress(
  date: string,
  fills: Record<string, number>,
  mode: ColourMode = "guided",
): boolean {
  const value: DayProgress = { v: STORAGE_VERSION, date, fills, updatedAt: Date.now() };
  return writeJSON(progressKey(date, mode), value);
}

export function loadPreferences(): Preferences | null {
  return readJSON(PREFS_KEY, isPreferences);
}

/** Merges into the saved preferences, so saving one setting keeps the others. */
export function savePreferences(prefs: Partial<Omit<Preferences, "v">>): boolean {
  const current = loadPreferences();
  return writeJSON(PREFS_KEY, {
    symmetry: 1000,
    ...(current ?? {}),
    ...prefs,
    v: STORAGE_VERSION,
  });
}
