import { readJSON, writeJSON } from "@/lib/storage/local";
import type { PlayReport } from "./report";

/**
 * Client-side play tracking. It reports anonymously and never interrupts
 * play: failures are ignored, and nothing is sent when the browser asks
 * not to be tracked (Global Privacy Control or Do Not Track).
 *
 * Active time counts the gaps between interactions, each capped at
 * IDLE_CAP_MS, so leaving the tab open doesn't inflate it.
 */

export const ENDPOINT = "/api/play";
export const DEVICE_KEY = "mandala:v1:device";
export const FLUSH_DELAY_MS = 20_000;
export const IDLE_CAP_MS = 30_000;
const activeKey = (date: string, mode: string) => `mandala:v1:active:${date}:${mode}`;

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function trackingAllowed(
  nav: { globalPrivacyControl?: unknown; doNotTrack?: string | null } = navigator as never,
) {
  if (nav.globalPrivacyControl === true) return false;
  if (nav.doNotTrack === "1") return false;
  return true;
}

/** A random ID for this browser, created on first use. Not linked to anything else. */
export function deviceId(): string {
  const existing = readJSON(DEVICE_KEY, isString);
  if (existing) return existing;
  const id = crypto.randomUUID();
  writeJSON(DEVICE_KEY, id);
  return id;
}

export type Send = (report: PlayReport, opts: { beacon: boolean }) => void;

export const sendReport: Send = (report, { beacon }) => {
  const body = JSON.stringify(report);
  try {
    if (beacon && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Tracking is best-effort.
  }
};

export interface TrackerOptions {
  date: string;
  version: number;
  mode: PlayReport["mode"];
  send?: Send;
  now?: () => number;
  enabled?: boolean;
}

export interface PlayState {
  progress: number;
  symmetryLines: number | null;
  /** Finished ("I'm done"), even if not everything is coloured. */
  completed?: boolean;
}

const isCompleted = (s: PlayState) => s.completed ?? s.progress >= 1;

export class PlayTracker {
  private activeMs: number;
  private lastInteraction: number | null = null;
  private state: PlayState = { progress: 0, symmetryLines: null };
  private dirty = false;
  private sentCompleted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly send: Send;
  private readonly now: () => number;
  readonly enabled: boolean;

  constructor(private readonly opts: TrackerOptions) {
    this.send = opts.send ?? sendReport;
    this.now = opts.now ?? Date.now;
    this.enabled = opts.enabled ?? trackingAllowed();
    this.activeMs = (readJSON(activeKey(opts.date, opts.mode), isNumber) ?? 0) * 1000;
  }

  get activeSeconds(): number {
    return Math.round(this.activeMs / 1000);
  }

  /** Call on every meaningful interaction (a tap that coloured, a setting change). */
  interact(state: PlayState): void {
    if (!this.enabled) return;
    const t = this.now();
    if (this.lastInteraction !== null) {
      this.activeMs += Math.min(Math.max(0, t - this.lastInteraction), IDLE_CAP_MS);
    }
    this.lastInteraction = t;
    this.state = state;
    this.dirty = true;
    writeJSON(activeKey(this.opts.date, this.opts.mode), this.activeSeconds);

    if (isCompleted(state) && !this.sentCompleted) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
    }
  }

  /** Send now if anything changed. `beacon` for page hide/unload. */
  flush({ beacon = false }: { beacon?: boolean } = {}): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.enabled || !this.dirty) return;
    this.dirty = false;
    const completed = isCompleted(this.state);
    if (completed) this.sentCompleted = true;
    this.send(
      {
        deviceId: deviceId(),
        date: this.opts.date,
        mode: this.opts.mode,
        version: this.opts.version,
        activeSeconds: Math.min(86_400, this.activeSeconds),
        progress: Math.min(1, Math.max(0, this.state.progress)),
        symmetryLines: this.state.symmetryLines,
        completed,
      },
      { beacon },
    );
  }

  dispose(): void {
    this.flush({ beacon: true });
  }
}
