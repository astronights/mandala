import { describe, expect, it } from "vitest";
import * as g from "./geometry";

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("polar", () => {
  it("converts and rounds to 2 decimals", () => {
    expect(g.polar(10, 0)).toEqual([10, 0]);
    expect(g.polar(10, Math.PI / 2)).toEqual([0, 10]);
    expect(g.polar(1, Math.PI / 4)).toEqual([0.71, 0.71]);
  });
});

describe("shape builders", () => {
  const half = Math.PI / 12;
  const cases: [string, string][] = [
    ["sector", g.annularSector(100, 150, half)],
    ["wedge", g.annularSector(0, 150, half)],
    ["circle", g.circle(10, -5, 20)],
    ["petal", g.petal(100, 180, half * 0.9, 0.5, 0.2)],
    ["lotus", g.petal(100, 180, half * 0.9, 0.5, 1)],
    ["leaf", g.leaf(100, 180, half * 0.7, 0.5)],
    ["teardrop", g.teardrop(100, 180, half * 0.7)],
    ["diamond", g.diamond(100, 180, half * 0.8)],
    ["ray", g.ray(100, 180, half * 0.4)],
    ["scallop", g.scallop(100, 180, half)!],
  ];

  it.each(cases)("%s is a closed, finite path", (_, d) => {
    expect(d.startsWith("M ")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).not.toMatch(/NaN|Infinity|undefined/);
    for (const n of numbers(d)) expect(Number.isFinite(n)).toBe(true);
  });

  it.each(cases)("%s stays within its outer radius", (_, d) => {
    for (const n of numbers(d)) expect(Math.abs(n)).toBeLessThanOrEqual(181);
  });

  it("an annular sector at r0 = 0 becomes a wedge from the centre", () => {
    expect(g.annularSector(0, 50, half).startsWith("M 0 0")).toBe(true);
  });

  it("scallop returns null when the bump cannot fit", () => {
    expect(g.scallop(100, 105, Math.PI / 3)).toBeNull();
  });

  it("diamond vertices sit on the axis at r0 and r1", () => {
    expect(g.diamond(10, 30, 0.2)).toMatch(/^M 10 0 .* L 30 0 /);
  });
});
