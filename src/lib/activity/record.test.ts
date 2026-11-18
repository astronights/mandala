import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migratedAppDb } from "../../../db/testing.ts";
import { summarizeDay } from "@/lib/mandala/summary";
import { handlePlay } from "./handler";
import { recordPlay } from "./record";
import type { PlayReport } from "./report";

let t: Awaited<ReturnType<typeof migratedAppDb>>;
beforeAll(async () => {
  t = await migratedAppDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.pg.exec("delete from plays; delete from devices; delete from daily_mandalas;");
});

const DEVICE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const report = (over: Partial<PlayReport> = {}): PlayReport => ({
  deviceId: DEVICE,
  date: "2026-11-18",
  mode: "colour",
  version: 1,
  activeSeconds: 60,
  progress: 0.3,
  symmetryLines: 12,
  completed: false,
  ...over,
});
const playRow = async () =>
  (
    await t.db.query<Record<string, unknown>>("select * from plays where device_id = $1", [DEVICE])
  )[0];
const ageRow = () =>
  t.pg.exec(
    "update plays set updated_at = updated_at - interval '1 hour', started_at = started_at - interval '1 hour'",
  );

describe("recordPlay", () => {
  it("creates the device, the day's mandala record and the play", async () => {
    expect(await recordPlay(t.db, report())).toEqual({ written: true });
    expect(await t.db.query("select id from devices")).toEqual([{ id: DEVICE }]);
    const play = await playRow();
    expect(play).toMatchObject({ mode: "colour", active_seconds: 60, symmetry_lines: 12 });
    expect(play.completed_at).toBeNull();

    const [day] = await t.db.query<Record<string, unknown>>("select * from daily_mandalas");
    const expected = summarizeDay("2026-11-18");
    expect(day).toMatchObject({
      mandala_version: 1,
      seed: "mandala",
      symmetry: expected.symmetry,
      ring_count: expected.ringCount,
      motifs: expected.motifs,
      piece_count: expected.pieceCount,
      palette: expected.palette,
      override_seed: null,
    });
  });

  it("throttles rapid updates but always lets a completion through", async () => {
    await recordPlay(t.db, report());
    expect(await recordPlay(t.db, report({ progress: 0.5 }))).toEqual({ written: false });
    expect((await playRow()).progress).toBeCloseTo(0.3);
    expect(await recordPlay(t.db, report({ progress: 1, completed: true }))).toEqual({
      written: true,
    });
    expect((await playRow()).completed_at).not.toBeNull();
  });

  it("keeps the longest active time, the latest progress, and completion once set", async () => {
    await recordPlay(t.db, report({ activeSeconds: 300, progress: 1, completed: true }));
    const completedAt = (await playRow()).completed_at;
    await ageRow();
    await recordPlay(t.db, report({ activeSeconds: 100, progress: 0.8, completed: false }));
    const play = await playRow();
    expect(play.active_seconds).toBe(300);
    expect(play.progress).toBeCloseTo(0.8);
    expect(play.completed_at).toEqual(completedAt);
  });

  it("keeps the last known symmetry setting when a report has none", async () => {
    await recordPlay(t.db, report({ symmetryLines: 4 }));
    await ageRow();
    await recordPlay(t.db, report({ symmetryLines: null }));
    expect((await playRow()).symmetry_lines).toBe(4);
  });

  it("records each mode separately and never rewrites a day's record", async () => {
    await recordPlay(t.db, report());
    await t.pg.exec("update daily_mandalas set override_note = 'keep me'");
    await recordPlay(t.db, report({ mode: "draw" }));
    expect(await t.db.query("select mode from plays order by mode")).toEqual([
      { mode: "colour" },
      { mode: "draw" },
    ]);
    expect(await t.db.query("select override_note from daily_mandalas")).toEqual([
      { override_note: "keep me" },
    ]);
  });
});

describe("handlePlay", () => {
  const NOW = new Date("2026-11-18T12:00:00Z");
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://mandala.example/api/play", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("records valid reports", async () => {
    const res = await handlePlay(post(report()), t.db, NOW);
    expect(res.status).toBe(204);
    expect(await playRow()).toBeDefined();
  });

  it("accepts and drops reports when no database is configured", async () => {
    expect((await handlePlay(post(report()), null, NOW)).status).toBe(204);
  });

  it("rejects invalid JSON, invalid reports and oversized bodies", async () => {
    expect((await handlePlay(post("{nope"), t.db, NOW)).status).toBe(400);
    const bad = await handlePlay(post({ ...report(), mode: "paint" }), t.db, NOW);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "mode is invalid" });
    expect((await handlePlay(post("x".repeat(5000)), t.db, NOW)).status).toBe(413);
    expect(
      (await handlePlay(post(report(), { "content-length": "999999" }), t.db, NOW)).status,
    ).toBe(413);
  });

  it("rejects reports from other sites", async () => {
    expect(
      (await handlePlay(post(report(), { origin: "https://evil.example" }), t.db, NOW)).status,
    ).toBe(403);
    expect(
      (await handlePlay(post(report(), { "sec-fetch-site": "cross-site" }), t.db, NOW)).status,
    ).toBe(403);
    expect(
      (await handlePlay(post(report(), { origin: "https://mandala.example" }), t.db, NOW)).status,
    ).toBe(204);
  });

  it("reports a temporary failure when the database errors", async () => {
    const broken = {
      query: async () => [],
      transaction: async () => {
        throw new Error("connection reset");
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handlePlay(post(report()), broken, NOW)).status).toBe(503);
    spy.mockRestore();
  });
});
