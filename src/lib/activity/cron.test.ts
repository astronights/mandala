import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migratedAppDb } from "../../../db/testing.ts";
import { handleRecordDay, liveDates } from "./cron";
import { recordDays } from "./record";

let t: Awaited<ReturnType<typeof migratedAppDb>>;
beforeAll(async () => {
  t = await migratedAppDb();
});
afterAll(() => t.close());

// When the daily job runs: 00:07 UTC.
const NOW = new Date("2026-11-18T00:07:00Z");
const call = (auth?: string) =>
  new Request("https://x.example/api/cron/record-day", {
    headers: auth ? { authorization: auth } : {},
  });

describe("liveDates", () => {
  it("covers every timezone's today, and never a day not yet begun", () => {
    // 00:07 UTC: it's still the 17th in UTC−12 and already the 18th in UTC+14.
    expect(liveDates(NOW)).toEqual(["2026-11-17", "2026-11-18"]);
    // 11:00 UTC: still the 17th in UTC−12, already the 19th in UTC+14.
    expect(liveDates(new Date("2026-11-18T11:00:00Z"))).toEqual([
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
    // 12:30 UTC: UTC−12 has reached the 18th.
    expect(liveDates(new Date("2026-11-18T12:30:00Z"))).toEqual(["2026-11-18", "2026-11-19"]);
  });
});

describe("recordDays", () => {
  it("records new days once, in full, and reports only the new ones", async () => {
    expect(await recordDays(t.db, ["2026-01-01", "2026-01-02"])).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
    expect(await recordDays(t.db, ["2026-01-02", "2026-01-03"])).toEqual(["2026-01-03"]);
    const rows = await t.db.query<{ d: string; has: boolean }>(
      "select play_date::text as d, mandala is not null as has from daily_mandalas order by 1",
    );
    expect(rows.every((r) => r.has)).toBe(true);
  });
});

describe("handleRecordDay", () => {
  it("requires the cron secret, and stays closed when none is configured", async () => {
    expect((await handleRecordDay(call(), t.db, { secret: "s", now: NOW })).status).toBe(401);
    expect((await handleRecordDay(call("Bearer x"), t.db, { secret: "s", now: NOW })).status).toBe(
      401,
    );
    expect((await handleRecordDay(call("Bearer "), t.db, { secret: "", now: NOW })).status).toBe(
      401,
    );
  });

  it("records the days that are live somewhere, once", async () => {
    const res = await handleRecordDay(call("Bearer s"), t.db, { secret: "s", now: NOW });
    expect(await res.json()).toEqual({ recorded: ["2026-11-17", "2026-11-18"] });
    const again = await handleRecordDay(call("Bearer s"), t.db, { secret: "s", now: NOW });
    expect(await again.json()).toEqual({ recorded: [] });
  });

  it("handles a missing or failing database", async () => {
    const none = await handleRecordDay(call("Bearer s"), null, { secret: "s", now: NOW });
    expect(await none.json()).toEqual({ recorded: [], configured: false });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      query: async () => [],
      transaction: async () => {
        throw new Error("down");
      },
    };
    const res = await handleRecordDay(call("Bearer s"), broken, { secret: "s", now: NOW });
    expect(res.status).toBe(503);
    spy.mockRestore();
  });
});
