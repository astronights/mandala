import { describe, expect, it } from "vitest";
import { generateMandala } from "./generate";
import { addDays } from "./date";

describe("generateMandala", () => {
  it("is deterministic for a date and seed", () => {
    const a = generateMandala("2026-11-18", "mandala");
    const b = generateMandala("2026-11-18", "mandala");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("varies by date and by seed", () => {
    const a = JSON.stringify(generateMandala("2026-11-18"));
    expect(JSON.stringify(generateMandala("2026-11-19"))).not.toBe(a);
    expect(JSON.stringify(generateMandala("2026-11-18", "other"))).not.toBe(a);
  });

  it("produces well-formed output across a year of dates", () => {
    let date = "2026-01-01";
    for (let i = 0; i < 365; i++) {
      const m = generateMandala(date);
      const shapeIds = new Set(m.shapes.map((s) => s.id));
      const groupIds = new Set(m.groups.map((g) => g.id));
      expect(m.regions.length).toBeGreaterThan(m.symmetry * 3);
      for (const r of m.regions) {
        expect(shapeIds.has(r.shape)).toBe(true);
        expect(groupIds.has(r.group)).toBe(true);
      }
      for (const s of m.shapes) expect(s.d).not.toMatch(/NaN|Infinity/);
      for (const g of m.groups) {
        expect(m.suggested[g.id]).toBeGreaterThanOrEqual(0);
        expect(m.suggested[g.id]).toBeLessThan(m.palette.colours.length);
      }
      date = addDays(date, 1);
    }
  });
});
