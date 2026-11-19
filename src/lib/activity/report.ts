import { SUPPORTED_VERSIONS } from "@/lib/mandala/generate";

/** What the app sends as someone plays (see /api/play). */
export interface PlayReport {
  deviceId: string;
  date: string;
  /** colour = guided colouring, free = free colouring. */
  mode: "colour" | "free" | "draw";
  version: number;
  /** Cumulative active seconds for this day and mode. */
  activeSeconds: number;
  /** Share coloured or drawn, 0..1. */
  progress: number;
  /** Lines of symmetry in use; 0 = off. */
  symmetryLines: number | null;
  completed: boolean;
}

export type ParseResult = { ok: true; value: PlayReport } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function utcDay(iso: string): number | null {
  if (!ISO_DATE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  // Reject impossible dates such as 2026-02-31.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return t;
}

/**
 * A report must be for "today" somewhere on Earth: local dates run from UTC−12
 * to UTC+14, so anything within a day either side of the server's UTC date.
 */
export function isPlausibleDate(iso: string, now: Date): boolean {
  const t = utcDay(iso);
  if (t === null) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return t >= today - DAY_MS && t <= today + DAY_MS;
}

export function parsePlayReport(body: unknown, now: Date = new Date()): ParseResult {
  if (!isRecord(body)) return { ok: false, error: "Expected a JSON object" };
  const { deviceId, date, mode, version, activeSeconds, progress, symmetryLines, completed } = body;

  if (typeof deviceId !== "string" || !UUID.test(deviceId)) {
    return { ok: false, error: "deviceId must be a UUID" };
  }
  if (typeof date !== "string" || !isPlausibleDate(date, now)) {
    return { ok: false, error: "date must be today's date (YYYY-MM-DD)" };
  }
  if (mode !== "colour" && mode !== "free" && mode !== "draw") {
    return { ok: false, error: "mode is invalid" };
  }
  if (typeof version !== "number" || !SUPPORTED_VERSIONS.includes(version)) {
    return { ok: false, error: "version is not supported" };
  }
  if (
    typeof activeSeconds !== "number" ||
    !Number.isFinite(activeSeconds) ||
    activeSeconds < 0 ||
    activeSeconds > 86_400
  ) {
    return { ok: false, error: "activeSeconds must be between 0 and 86400" };
  }
  if (typeof progress !== "number" || !(progress >= 0 && progress <= 1)) {
    return { ok: false, error: "progress must be between 0 and 1" };
  }
  if (
    symmetryLines !== null &&
    symmetryLines !== undefined &&
    (typeof symmetryLines !== "number" ||
      !Number.isInteger(symmetryLines) ||
      symmetryLines < 0 ||
      symmetryLines > 64)
  ) {
    return { ok: false, error: "symmetryLines must be an integer from 0 to 64" };
  }
  if (typeof completed !== "boolean") return { ok: false, error: "completed must be a boolean" };

  return {
    ok: true,
    value: {
      deviceId: deviceId.toLowerCase(),
      date,
      mode,
      version,
      activeSeconds: Math.round(activeSeconds),
      progress,
      symmetryLines: symmetryLines ?? null,
      completed,
    },
  };
}
