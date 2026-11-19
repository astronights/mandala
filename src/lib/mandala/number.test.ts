import { describe, expect, it } from "vitest";
import { FIRST_DAY, mandalaNumber } from "./number";
import { addDays } from "./date";

describe("mandalaNumber", () => {
  it("starts at #1 on launch day and counts up daily", () => {
    expect(FIRST_DAY).toBe("2026-11-19");
    expect(mandalaNumber("2026-11-19")).toBe(1);
    expect(mandalaNumber("2026-11-20")).toBe(2);
    expect(mandalaNumber("2026-12-31")).toBe(43);
    expect(mandalaNumber("2027-11-19")).toBe(366);
  });

  it("has no number before launch", () => {
    expect(mandalaNumber("2026-11-18")).toBeNull();
    expect(mandalaNumber("2025-01-01")).toBeNull();
  });

  it("never skips or repeats across daylight-saving changes", () => {
    let d = FIRST_DAY;
    for (let i = 1; i <= 800; i++, d = addDays(d, 1)) expect(mandalaNumber(d)).toBe(i);
  });
});
