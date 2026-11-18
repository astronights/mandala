import { describe, expect, it } from "vitest";
import { generateMandala } from "./generate";
import { addDays } from "./date";
import {
  nearestSymmetry,
  SymmetryIndex,
  symmetryAxes,
  symmetryOptions,
  SYMMETRY_OFF,
} from "./symmetry";

const SAMPLE = Array.from({ length: 40 }, (_, i) => generateMandala(addDays("2026-11-01", i)));

describe("symmetryOptions", () => {
  it.each([
    [6, [0, 1, 2, 3, 6]],
    [8, [0, 1, 2, 4, 8]],
    [10, [0, 1, 2, 5, 10]],
    [12, [0, 1, 2, 3, 4, 6, 12]],
    [16, [0, 1, 2, 4, 8, 16]],
  ])("offers off plus the divisors of %i", (n, expected) => {
    expect(symmetryOptions(n)).toEqual(expected);
  });
});

describe("nearestSymmetry", () => {
  it("keeps valid choices and maps others to the closest option", () => {
    expect(nearestSymmetry(12, 4)).toBe(4);
    expect(nearestSymmetry(12, 0)).toBe(SYMMETRY_OFF);
    expect(nearestSymmetry(8, 3)).toBe(2); // ties go to the smaller
    expect(nearestSymmetry(10, 4)).toBe(5);
    expect(nearestSymmetry(16, 1000)).toBe(16);
  });
});

describe("symmetryAxes", () => {
  it("spaces k mirror lines evenly over 180°", () => {
    expect(symmetryAxes(0)).toEqual([]);
    expect(symmetryAxes(1)).toEqual([0]);
    expect(symmetryAxes(4)).toEqual([0, 45, 90, 135]);
  });
});

describe("SymmetryIndex.orbit", () => {
  it("fills only the tapped piece when symmetry is off", () => {
    const idx = new SymmetryIndex(SAMPLE[0]);
    for (let i = 0; i < SAMPLE[0].regions.length; i++) expect(idx.orbit(i, 0)).toEqual([i]);
  });

  it("returns nothing for an unknown region", () => {
    expect(new SymmetryIndex(SAMPLE[0]).orbit(99999, 4)).toEqual([]);
  });

  it("produces orbits that contain the piece, divide |D_k| and are closed", () => {
    for (const m of SAMPLE) {
      const idx = new SymmetryIndex(m);
      // Full assist (k = n) is covered separately: it fills all identical copies.
      for (const k of symmetryOptions(m.symmetry).slice(1, -1)) {
        for (let i = 0; i < m.regions.length; i += 3) {
          const orbit = idx.orbit(i, k);
          expect(orbit).toContain(i);
          expect((2 * k) % orbit.length).toBe(0);
          // Closed: every member generates the same orbit.
          for (const j of orbit) expect(idx.orbit(j, k)).toEqual(orbit);
        }
      }
    }
  });

  it("only links pieces with identical geometry", () => {
    for (const m of SAMPLE.slice(0, 10)) {
      const d = new Map(m.shapes.map((s) => [s.id, s.d]));
      const idx = new SymmetryIndex(m);
      for (let i = 0; i < m.regions.length; i += 2) {
        const shape = d.get(m.regions[i].shape);
        for (const j of idx.orbit(i, m.symmetry)) expect(d.get(m.regions[j].shape)).toBe(shape);
      }
    }
  });

  it("at full symmetry, fills every copy of the piece", () => {
    for (const m of SAMPLE) {
      const d = new Map(m.shapes.map((s) => [s.id, s.d]));
      const copies = new Map<string, number>();
      for (const r of m.regions)
        copies.set(d.get(r.shape)!, (copies.get(d.get(r.shape)!) ?? 0) + 1);
      const idx = new SymmetryIndex(m);
      for (let i = 0; i < m.regions.length; i += 5) {
        expect(idx.orbit(i, m.symmetry).length).toBe(copies.get(d.get(m.regions[i].shape)!));
      }
    }
  });

  it("grows monotonically as more lines are added (k1 | k2 ⇒ orbit ⊆)", () => {
    for (const m of SAMPLE) {
      const idx = new SymmetryIndex(m);
      const options = symmetryOptions(m.symmetry).slice(1);
      for (let i = 0; i < m.regions.length; i += 7) {
        for (const k1 of options) {
          for (const k2 of options) {
            if (k2 % k1 !== 0) continue;
            const big = new Set(idx.orbit(i, k2));
            for (const j of idx.orbit(i, k1)) expect(big.has(j)).toBe(true);
          }
        }
      }
    }
  });

  it("with one line, pairs a piece with its mirror image", () => {
    const m = SAMPLE.find((x) => x.symmetry >= 8)!;
    const idx = new SymmetryIndex(m);
    const i = m.regions.findIndex((r) => Math.abs(r.rotate - 90) < 0.01);
    expect(i).toBeGreaterThanOrEqual(0);
    const orbit = idx.orbit(i, 1).map((j) => m.regions[j].rotate);
    expect(orbit).toHaveLength(2);
    expect(orbit).toContain(270);
  });
});
