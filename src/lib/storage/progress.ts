import { readJSON, removeKey, writeJSON } from "./local";
import { isStroke, type Stroke } from "@/lib/draw";

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
/** Everything the day can be played as. */
export type PlayMode = ColourMode | "draw";
export const PLAY_MODES: readonly PlayMode[] = ["guided", "free", "draw"];

export interface Preferences {
  v: number;
  /** Preferred lines of symmetry; Infinity-like values mean "full". */
  symmetry: number;
  /** Guided (the day's colours), free colouring, or drawing. */
  mode?: PlayMode;
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
    (v.mode === undefined || PLAY_MODES.includes(v.mode as PlayMode))
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

/** "I'm done" for a day and mode: shown as finished when the day is reopened. */
export interface DayDone {
  v: number;
  date: string;
  mode: PlayMode;
  finishedAt: number;
}

export const doneKey = (date: string, mode: PlayMode) =>
  `mandala:v${STORAGE_VERSION}:done:${date}:${mode}`;

export function isDayDone(v: unknown): v is DayDone {
  return (
    isRecord(v) &&
    v.v === STORAGE_VERSION &&
    typeof v.date === "string" &&
    PLAY_MODES.includes(v.mode as PlayMode) &&
    typeof v.finishedAt === "number"
  );
}

export function loadDone(date: string, mode: PlayMode): DayDone | null {
  const d = readJSON(doneKey(date, mode), isDayDone);
  return d && d.date === date && d.mode === mode ? d : null;
}

export function saveDone(date: string, mode: PlayMode, finishedAt = Date.now()): boolean {
  return writeJSON(doneKey(date, mode), { v: STORAGE_VERSION, date, mode, finishedAt });
}

/** "Keep colouring": the day is open again until finished once more. */
export function clearDone(date: string, mode: PlayMode): void {
  removeKey(doneKey(date, mode));
}

/** Today's drawing. */
export interface DayDrawing {
  v: number;
  date: string;
  strokes: Stroke[];
}

export const drawingKey = (date: string) => `mandala:v${STORAGE_VERSION}:draw:${date}`;

export function isDayDrawing(v: unknown): v is DayDrawing {
  return (
    isRecord(v) &&
    v.v === STORAGE_VERSION &&
    typeof v.date === "string" &&
    Array.isArray(v.strokes) &&
    v.strokes.every(isStroke)
  );
}

export function loadDrawing(date: string): Stroke[] {
  const d = readJSON(drawingKey(date), isDayDrawing);
  return d && d.date === date ? d.strokes : [];
}

export function saveDrawing(date: string, strokes: Stroke[]): boolean {
  return writeJSON(drawingKey(date), { v: STORAGE_VERSION, date, strokes });
}
