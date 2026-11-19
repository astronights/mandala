// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayReport } from "./report";
import {
  DEVICE_KEY,
  deviceId,
  ENDPOINT,
  FLUSH_DELAY_MS,
  IDLE_CAP_MS,
  PlayTracker,
  sendReport,
  trackingAllowed,
} from "./tracker";

let clock = 0;
const sent: { report: PlayReport; beacon: boolean }[] = [];
const make = (over: Partial<ConstructorParameters<typeof PlayTracker>[0]> = {}) =>
  new PlayTracker({
    date: "2026-11-18",
    version: 1,
    mode: "colour",
    send: (report, { beacon }) => sent.push({ report, beacon }),
    now: () => clock,
    enabled: true,
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000;
  sent.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("trackingAllowed", () => {
  it("honours Global Privacy Control and Do Not Track", () => {
    expect(trackingAllowed({})).toBe(true);
    expect(trackingAllowed({ globalPrivacyControl: true })).toBe(false);
    expect(trackingAllowed({ doNotTrack: "1" })).toBe(false);
    expect(trackingAllowed({ doNotTrack: "0" })).toBe(true);
  });
});

describe("deviceId", () => {
  it("creates a random UUID once and reuses it", () => {
    const id = deviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId()).toBe(id);
    expect(JSON.parse(localStorage.getItem(DEVICE_KEY)!)).toBe(id);
  });
});

describe("PlayTracker", () => {
  it("batches interactions into one report after a delay", () => {
    const t = make();
    t.interact({ progress: 0.1, symmetryLines: 12 });
    clock += 5_000;
    t.interact({ progress: 0.2, symmetryLines: 12 });
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0].report).toMatchObject({
      date: "2026-11-18",
      mode: "colour",
      version: 1,
      activeSeconds: 5,
      progress: 0.2,
      symmetryLines: 12,
      completed: false,
    });
    expect(sent[0].report.deviceId).toBe(deviceId());
  });

  it("caps idle gaps so an open tab doesn't count as play", () => {
    const t = make();
    t.interact({ progress: 0.1, symmetryLines: 0 });
    clock += 10 * 60_000;
    t.interact({ progress: 0.2, symmetryLines: 0 });
    expect(t.activeSeconds).toBe(IDLE_CAP_MS / 1000);
  });

  it("sends immediately on completion, once", () => {
    const t = make();
    t.interact({ progress: 0.5, symmetryLines: 4 });
    t.interact({ progress: 1, symmetryLines: 4 });
    expect(sent).toHaveLength(1);
    expect(sent[0].report.completed).toBe(true);
    t.interact({ progress: 1, symmetryLines: 4 });
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(sent).toHaveLength(2);
  });

  it("flushes with a beacon when the page goes away, and only if something changed", () => {
    const t = make();
    t.dispose();
    expect(sent).toHaveLength(0);
    t.interact({ progress: 0.3, symmetryLines: null });
    t.flush({ beacon: true });
    expect(sent).toEqual([expect.objectContaining({ beacon: true })]);
    t.flush({ beacon: true });
    expect(sent).toHaveLength(1);
  });

  it("carries active time across reloads of the same day", () => {
    const a = make();
    a.interact({ progress: 0.1, symmetryLines: 0 });
    clock += 20_000;
    a.interact({ progress: 0.2, symmetryLines: 0 });
    expect(make().activeSeconds).toBe(20);
    expect(make({ date: "2026-11-19" }).activeSeconds).toBe(0);
  });

  it("does nothing when tracking is not allowed", () => {
    const t = make({ enabled: false });
    t.interact({ progress: 1, symmetryLines: 0 });
    t.flush();
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(sent).toHaveLength(0);
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull();
  });
});

describe("sendReport", () => {
  const report = {
    deviceId: "x",
    date: "2026-11-18",
    mode: "colour",
    version: 1,
    activeSeconds: 1,
    progress: 0,
    symmetryLines: null,
    completed: false,
  } as const;

  it("uses a beacon when asked and available", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    sendReport(report, { beacon: true });
    expect(beacon).toHaveBeenCalledWith(ENDPOINT, expect.any(Blob));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to a keepalive fetch and swallows failures", async () => {
    Object.defineProperty(navigator, "sendBeacon", { value: () => false, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    sendReport(report, { beacon: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify(report) }),
    );
    await Promise.resolve();
  });
});

describe("PlayTracker completion", () => {
  it("reports an early 'I'm done' as completed, with the real progress", () => {
    const t = make();
    t.interact({ progress: 0.4, symmetryLines: 8, completed: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].report).toMatchObject({ progress: 0.4, completed: true });
  });
});
