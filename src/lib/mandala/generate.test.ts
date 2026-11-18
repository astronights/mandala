import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEED,
  generateMandala,
  MANDALA_VERSION,
  VIEW_RADIUS,
  type Mandala,
} from "./generate";
import { hashString } from "./random";
import { addDays } from "./date";

const YEAR: Mandala[] = (() => {
  const out: Mandala[] = [];
  let d = "2026-01-01";
  for (let i = 0; i < 365; i++, d = addDays(d, 1)) out.push(generateMandala(d));
  return out;
})();

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("generateMandala: determinism", () => {
  it("returns identical output for the same date and seed", () => {
    const a = generateMandala("2026-11-18", "mandala");
    const b = generateMandala("2026-11-18", "mandala");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("uses the default seed when none is given", () => {
    expect(generateMandala("2026-11-18")).toEqual(generateMandala("2026-11-18", DEFAULT_SEED));
  });

  it("varies by date and by seed", () => {
    const a = JSON.stringify(generateMandala("2026-11-18"));
    expect(JSON.stringify(generateMandala("2026-11-19"))).not.toBe(a);
    expect(JSON.stringify(generateMandala("2026-11-18", "other"))).not.toBe(a);
  });

  it("gives every day of a year a distinct mandala", () => {
    const prints = new Set(YEAR.map((m) => hashString(JSON.stringify(m.shapes))));
    expect(prints.size).toBe(YEAR.length);
  });

  /**
   * Golden fingerprints. If this fails, a code change altered what players
   * see on these dates. If that is intended, bump MANDALA_VERSION and update
   * the snapshots (`npx vitest -u`); otherwise, fix the regression.
   */
  it("matches the pinned fingerprints for this version", () => {
    expect(MANDALA_VERSION).toBe(1);
    const fingerprint = (date: string) => hashString(JSON.stringify(generateMandala(date)));
    expect({
      "2026-01-01": fingerprint("2026-01-01"),
      "2026-11-18": fingerprint("2026-11-18"),
      "2027-06-30": fingerprint("2027-06-30"),
    }).toMatchInlineSnapshot(`
      {
        "2026-01-01": 566863281,
        "2026-11-18": 2446320523,
        "2027-06-30": 1796084552,
      }
    `);
  });
});

describe("generateMandala: structure across a year", () => {
  it("uses only supported symmetries, with variety", () => {
    const seen = new Set(YEAR.map((m) => m.symmetry));
    for (const s of seen) expect([6, 8, 10, 12, 16]).toContain(s);
    expect(seen.size).toBe(5);
  });

  it("has 5–8 rings that tile outward without gaps", () => {
    for (const m of YEAR) {
      expect(m.rings.length).toBeGreaterThanOrEqual(5);
      expect(m.rings.length).toBeLessThanOrEqual(8);
      expect(m.rings[0].motif).toBe("centre");
      expect(m.rings.at(-1)!.rim).toBe(true);
      for (let i = 1; i < m.rings.length; i++) {
        expect(m.rings[i].r0).toBeCloseTo(m.rings[i - 1].r1, 6);
        expect(m.rings[i].r1).toBeGreaterThan(m.rings[i].r0);
      }
    }
  });

  it("never repeats a motif in adjacent rings", () => {
    for (const m of YEAR) {
      for (let i = 2; i < m.rings.length; i++) {
        expect(m.rings[i].motif).not.toBe(m.rings[i - 1].motif);
      }
    }
  });

  it("references only shapes and groups that exist", () => {
    for (const m of YEAR) {
      const shapes = new Set(m.shapes.map((s) => s.id));
      const groups = new Set(m.groups.map((g) => g.id));
      expect(shapes.size).toBe(m.shapes.length);
      expect(groups.size).toBe(m.groups.length);
      for (const r of m.regions) {
        expect(shapes.has(r.shape)).toBe(true);
        expect(groups.has(r.group)).toBe(true);
      }
    }
  });

  it("keeps every path finite and inside the view", () => {
    for (const m of YEAR) {
      for (const s of m.shapes) {
        expect(s.d).not.toMatch(/NaN|Infinity|undefined/);
        for (const n of numbers(s.d)) expect(Math.abs(n)).toBeLessThanOrEqual(VIEW_RADIUS);
      }
    }
  });

  it("places each repeated group once per segment (or per slot)", () => {
    for (const m of YEAR) {
      const counts = new Map<string, number>();
      for (const r of m.regions) counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
      for (const [group, count] of counts) {
        if (group === "r0-base" || group === "r0-accent") expect(count).toBe(1);
        else if (group.includes("base")) expect(count % (m.symmetry / 2)).toBe(0);
        else expect(count % m.symmetry).toBe(0);
      }
    }
  });

  it("keeps a sensible number of pieces to colour", () => {
    for (const m of YEAR) {
      expect(m.regions.length).toBeGreaterThan(m.symmetry * 4);
      expect(m.regions.length).toBeLessThan(800);
      expect(m.groups.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("suggests a valid colouring with no base matching its neighbour ring", () => {
    for (const m of YEAR) {
      for (const g of m.groups) {
        expect(m.suggested[g.id]).toBeGreaterThanOrEqual(0);
        expect(m.suggested[g.id]).toBeLessThan(m.palette.colours.length);
        if (g.role === "accent") {
          const motif = m.suggested[`r${g.ring}-motif`];
          if (motif !== undefined) expect(m.suggested[g.id]).not.toBe(motif);
        }
      }
    }
  });

  it("paints the rim first and the centre last", () => {
    for (const m of YEAR) {
      const ringOf = new Map(m.groups.map((g) => [g.id, g.ring]));
      const rings = m.regions.map((r) => ringOf.get(r.group)!);
      for (let i = 1; i < rings.length; i++) expect(rings[i]).toBeLessThanOrEqual(rings[i - 1]);
    }
  });
});
