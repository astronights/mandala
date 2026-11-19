import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, formatDay, formatLong, toISODate, todayISO } from "./date";

afterEach(() => vi.useRealTimers());

describe("dates", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("uses the local calendar day for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 18, 23, 59, 59));
    expect(todayISO()).toBe("2026-11-18");
    vi.setSystemTime(new Date(2026, 10, 19, 0, 0, 1));
    expect(todayISO()).toBe("2026-11-19");
  });

  it.each([
    ["2026-11-18", 1, "2026-11-19"],
    ["2026-11-30", 1, "2026-12-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-03-08", 1, "2026-03-09"], // US DST start
    ["2026-03-29", 1, "2026-03-30"], // EU DST start
    ["2026-11-01", 1, "2026-11-02"], // US DST end
    ["2026-11-18", 0, "2026-11-18"],
    ["2026-11-18", -365, "2025-11-18"],
  ])("addDays(%s, %i) = %s", (from, n, to) => {
    expect(addDays(from, n)).toBe(to);
  });

  it("walks a full year one day at a time without skipping or repeating", () => {
    const seen = new Set<string>();
    let d = "2026-01-01";
    for (let i = 0; i < 365; i++) {
      seen.add(d);
      d = addDays(d, 1);
    }
    expect(seen.size).toBe(365);
    expect(d).toBe("2027-01-01");
  });

  it("formats a readable label", () => {
    expect(formatLong("2026-11-18")).toMatch(/2026/);
    expect(formatDay("2026-11-18")).not.toMatch(/2026/);
    expect(formatDay("2026-11-18")).toMatch(/18/);
  });
});
