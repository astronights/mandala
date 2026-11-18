import { describe, expect, it } from "vitest";
import { generateMandala, MANDALA_VERSION } from "./generate";
import { summarize, summarizeDay } from "./summary";

describe("summarize", () => {
  it("captures the inputs and the shape of the day's pattern", () => {
    const m = generateMandala("2026-11-18");
    const s = summarize(m);
    expect(s).toMatchObject({
      date: "2026-11-18",
      version: MANDALA_VERSION,
      seed: "mandala",
      symmetry: m.symmetry,
      ringCount: m.rings.length,
      pieceCount: m.regions.length,
      groupCount: m.groups.length,
      paletteScheme: m.palette.scheme,
    });
    expect(s.motifs[0]).toBe("centre");
    expect(s.motifs).toHaveLength(s.ringCount);
    expect(s.palette).toHaveLength(6);
  });

  it("summarizeDay regenerates from the inputs", () => {
    expect(summarizeDay("2026-11-18")).toEqual(summarize(generateMandala("2026-11-18")));
  });

  it("refuses versions this code cannot reproduce", () => {
    expect(() => summarizeDay("2026-11-18", "mandala", 99)).toThrow(/Unsupported/);
  });
});
