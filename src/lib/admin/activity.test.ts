import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migratedAppDb } from "../../../db/testing.ts";
import { recordPlay } from "@/lib/activity/record";
import type { PlayReport } from "@/lib/activity/report";
import { summarizeDay } from "@/lib/mandala/summary";
import { createSessionToken, SESSION_COOKIE, type AdminMode } from "./auth";
import { activityWindow, handleActivity, loadActivity } from "./activity";

let t: Awaited<ReturnType<typeof migratedAppDb>>;
const NOW = new Date("2026-11-18T12:00:00Z");
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const play = (over: Partial<PlayReport>) =>
  recordPlay(
    t.db,
    {
      deviceId: A,
      date: "2026-11-18",
      mode: "colour",
      version: 1,
      activeSeconds: 60,
      progress: 0.5,
      symmetryLines: 12,
      completed: false,
      ...over,
    },
    { throttleSeconds: 0 },
  );

beforeAll(async () => {
  t = await migratedAppDb();
  await play({ activeSeconds: 100, progress: 1, completed: true });
  await play({ deviceId: B, activeSeconds: 20, progress: 0.2, symmetryLines: 0 });
  await play({ deviceId: B, date: "2026-11-17", activeSeconds: 40, symmetryLines: 0 });
});
afterAll(() => t.close());

describe("activityWindow", () => {
  it("ends tomorrow (UTC) and spans the requested days", () => {
    expect(activityWindow(30, NOW)).toEqual({ from: "2026-10-20", to: "2026-11-19" });
    expect(activityWindow(1, NOW)).toEqual({ from: "2026-11-18", to: "2026-11-19" });
  });
});

describe("loadActivity", () => {
  it("summarises totals, days, symmetry usage and completion by fold", async () => {
    const r = await loadActivity(t.db, { days: 30, now: NOW });
    expect(r.totals).toEqual({ devices: 2, active1d: 2, active7d: 2, plays: 3, finishes: 1 });

    expect(r.daily.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-17"]);
    const today = r.daily[0];
    expect(today).toMatchObject({
      players: 2,
      finishers: 1,
      colourPlays: 2,
      drawPlays: 0,
      freePlays: 0,
      avgActiveSeconds: 60,
      symmetry: summarizeDay("2026-11-18").symmetry,
      pieceCount: summarizeDay("2026-11-18").pieceCount,
    });
    expect(today.avgProgress).toBeCloseTo(0.6);

    expect(r.symmetryUsage).toEqual([
      { lines: 0, plays: 2 },
      { lines: 12, plays: 1 },
    ]);
    const folds = r.byFold.reduce((s, f) => s + f.plays, 0);
    expect(folds).toBe(3);
  });

  it("only includes the requested window", async () => {
    const r = await loadActivity(t.db, { days: 1, now: NOW });
    expect(r.daily.map((d) => d.date)).toEqual(["2026-11-18"]);
    expect(r.totals.plays).toBe(2);
  });
});

describe("handleActivity", () => {
  const mode: AdminMode = { kind: "protected", passcode: "pw", secret: "sec" };
  const get = (query = "", cookie?: string) =>
    new Request(`https://x.example/api/admin/activity${query}`, {
      headers: cookie ? { cookie } : {},
    });
  const signedIn = async () =>
    `${SESSION_COOKIE}=${await createSessionToken("sec", NOW.getTime())}`;

  it("requires a session", async () => {
    expect((await handleActivity(get(), t.db, { mode, now: NOW })).status).toBe(401);
  });

  it("returns the report, clamping the day range", async () => {
    const res = await handleActivity(get("?days=9999", await signedIn()), t.db, { mode, now: NOW });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.from).toBe(activityWindow(365, NOW).from);
  });

  it("says when no database is configured", async () => {
    const res = await handleActivity(get("", await signedIn()), null, { mode, now: NOW });
    expect(await res.json()).toEqual({ configured: false });
  });

  it("reports a temporary failure on database errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      query: async () => {
        throw new Error("down");
      },
      transaction: async () => [],
    };
    const res = await handleActivity(get("?days=abc", await signedIn()), broken, {
      mode,
      now: NOW,
    });
    expect(res.status).toBe(503);
    spy.mockRestore();
  });
});
