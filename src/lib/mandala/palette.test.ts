import { describe, expect, it } from "vitest";
import { createRng } from "./random";
import { generatePalette, makeColour } from "./palette";

describe("makeColour", () => {
  it("wraps hue into [0, 360) and formats CSS", () => {
    expect(makeColour(0.5, 0.1, -30).h).toBe(330);
    expect(makeColour(0.5, 0.1, 400).h).toBe(40);
    expect(makeColour(0.81234, 0.05, 10).css).toBe("oklch(0.812 0.05 10)");
  });
});

describe("generatePalette", () => {
  it("is deterministic for an rng key", () => {
    expect(generatePalette(createRng("p"))).toEqual(generatePalette(createRng("p")));
  });

  it("keeps colours soft and calm across many seeds", () => {
    for (let i = 0; i < 300; i++) {
      const { colours, scheme } = generatePalette(createRng(`palette-${i}`));
      expect(colours).toHaveLength(6);
      expect(["analogous", "complementary", "triadic", "split", "monochrome"]).toContain(scheme);
      for (const c of colours) {
        expect(c.l).toBeGreaterThanOrEqual(0.55);
        expect(c.l).toBeLessThanOrEqual(0.98);
        expect(c.c).toBeGreaterThanOrEqual(0.015);
        expect(c.c).toBeLessThanOrEqual(0.12);
        expect(c.h).toBeGreaterThanOrEqual(0);
        expect(c.h).toBeLessThan(360);
        expect(c.css).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
      }
    }
  });

  it("spreads lightness so colours are distinguishable", () => {
    for (let i = 0; i < 100; i++) {
      const ls = generatePalette(createRng(`spread-${i}`)).colours.map((c) => c.l);
      expect(Math.max(...ls) - Math.min(...ls)).toBeGreaterThan(0.2);
    }
  });
});
