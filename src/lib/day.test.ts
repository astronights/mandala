import { describe, expect, it } from "vitest";
import { formatCountdown, liveDates, msUntilNextDay } from "./day";

describe("msUntilNextDay", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilNextDay(new Date(2026, 10, 19, 23, 0))).toBe(3_600_000);
    expect(msUntilNextDay(new Date(2026, 10, 19, 0, 0))).toBe(86_400_000);
    expect(msUntilNextDay(new Date(2026, 11, 31, 23, 59, 30))).toBe(30_000);
  });
});

describe("formatCountdown", () => {
  it.each([
    [0, "less than a minute"],
    [59_000, "less than a minute"],
    [60_000, "1m"],
    [12 * 60_000 + 30_000, "12m"],
    [6 * 3_600_000 + 12 * 60_000, "6h 12m"],
    [23 * 3_600_000, "23h 0m"],
  ])("%i ms → %s", (ms, out) => expect(formatCountdown(ms)).toBe(out));
});

describe("liveDates", () => {
  it("lists the dates that are today somewhere", () => {
    expect(liveDates(new Date("2026-11-19T00:07:00Z"))).toEqual(["2026-11-18", "2026-11-19"]);
    // 11:59 UTC: still the 18th in UTC−12, already the 20th in UTC+14.
    expect(liveDates(new Date("2026-11-19T11:59:00Z"))).toEqual([
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
    ]);
  });
});
