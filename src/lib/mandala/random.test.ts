import { describe, expect, it } from "vitest";
import { createRng, hashString, mulberry32 } from "./random";

describe("hashString", () => {
  it("is stable across runs and platforms", () => {
    // Pinned values: changing the hash would change every day's mandala.
    expect(hashString("")).toBe(hashString(""));
    expect(hashString("mandala")).toMatchInlineSnapshot(`1500681410`);
    expect(hashString("v1|mandala|2026-11-18")).toMatchInlineSnapshot(`3516569826`);
  });

  it("returns unsigned 32-bit integers and separates similar keys", () => {
    const keys = ["a", "b", "ab", "ba", "2026-11-18", "2026-11-19"];
    const hashes = keys.map(hashString);
    for (const h of hashes) {
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
    expect(new Set(hashes).size).toBe(keys.length);
  });
});

describe("mulberry32", () => {
  it("produces a reproducible stream in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("is roughly uniform", () => {
    const next = mulberry32(7);
    const buckets = new Array(10).fill(0);
    const N = 20000;
    for (let i = 0; i < N; i++) buckets[Math.floor(next() * 10)]++;
    for (const count of buckets) expect(Math.abs(count - N / 10)).toBeLessThan(N * 0.015);
  });
});

describe("createRng helpers", () => {
  it("range, int, chance and pick stay in bounds", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 2000; i++) {
      const r = rng.range(-3, 5);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
      const n = rng.int(2, 4);
      expect([2, 3, 4]).toContain(n);
      expect(typeof rng.chance(0.5)).toBe("boolean");
      expect(["x", "y"]).toContain(rng.pick(["x", "y"]));
    }
  });

  it("int is inclusive on both ends", () => {
    const rng = createRng("inclusive");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("chance(0) never and chance(1) always", () => {
    const rng = createRng("chance");
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it("weighted respects weights and never picks zero-weight items", () => {
    const rng = createRng("weighted");
    const counts = { a: 0, b: 0, never: 0 };
    for (let i = 0; i < 6000; i++) {
      counts[
        rng.weighted<"a" | "b" | "never">([
          ["a", 3],
          ["b", 1],
          ["never", 0],
        ])
      ]++;
    }
    expect(counts.never).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);
  });
});
