import { describe, expect, it } from "vitest";
import { isPlausibleDate, parsePlayReport } from "./report";

const NOW = new Date("2026-11-18T12:00:00Z");
const valid = {
  deviceId: "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
  date: "2026-11-18",
  mode: "colour",
  version: 1,
  activeSeconds: 120.4,
  progress: 0.42,
  symmetryLines: 12,
  completed: false,
};

describe("isPlausibleDate", () => {
  it.each([
    ["2026-11-17", true],
    ["2026-11-18", true],
    ["2026-11-19", true],
    ["2026-11-16", false],
    ["2026-11-20", false],
    ["2026-02-31", false],
    ["18/11/2026", false],
  ])("%s → %s", (d, ok) => {
    expect(isPlausibleDate(d, NOW)).toBe(ok);
  });
});

describe("parsePlayReport", () => {
  it("accepts a valid report and normalises it", () => {
    const r = parsePlayReport(valid, NOW);
    expect(r).toEqual({
      ok: true,
      value: { ...valid, deviceId: valid.deviceId.toLowerCase(), activeSeconds: 120 },
    });
  });

  it("treats a missing symmetry setting as null", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.symmetryLines;
    const r = parsePlayReport(rest, NOW);
    expect(r.ok && r.value.symmetryLines).toBeNull();
  });

  it.each<[string, unknown]>([
    ["not an object", "hello"],
    ["an array", []],
    ["a bad device id", { ...valid, deviceId: "abc" }],
    ["a stale date", { ...valid, date: "2026-11-01" }],
    ["an unknown mode", { ...valid, mode: "paint" }],
    ["an unknown version", { ...valid, version: 7 }],
    ["negative time", { ...valid, activeSeconds: -1 }],
    ["too much time", { ...valid, activeSeconds: 90_000 }],
    ["non-finite time", { ...valid, activeSeconds: Infinity }],
    ["progress above 1", { ...valid, progress: 1.01 }],
    ["NaN progress", { ...valid, progress: NaN }],
    ["fractional symmetry", { ...valid, symmetryLines: 2.5 }],
    ["string completed", { ...valid, completed: "yes" }],
  ])("rejects %s", (_, body) => {
    expect(parsePlayReport(body, NOW).ok).toBe(false);
  });
});
