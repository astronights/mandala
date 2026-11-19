import { describe, expect, it } from "vitest";
import { generateMandala, SymmetryIndex } from "@/lib/mandala";
import {
  guidedProgress,
  guidedTap,
  hintFill,
  nextColour,
  remainingByColour,
  targetColours,
} from "./guided";

const m = generateMandala("2026-11-18");
const targets = targetColours(m);
const index = new SymmetryIndex(m);

describe("targetColours", () => {
  it("gives every piece its group's designed colour", () => {
    expect(targets).toHaveLength(m.regions.length);
    m.regions.forEach((r, i) => expect(targets[i]).toBe(m.suggested[r.group]));
  });
});

describe("guidedTap", () => {
  const piece = m.regions.findIndex((r) => r.rotate !== 0);
  const want = targets[piece];
  const other = (want + 1) % m.palette.colours.length;

  it("fills the piece and its symmetric copies that want this colour", () => {
    const orbit = index.orbit(piece, m.symmetry);
    const tap = guidedTap(piece, orbit, targets, want, {});
    expect(tap.kind).toBe("fill");
    if (tap.kind === "fill") {
      expect(tap.indices).toContain(piece);
      for (const i of tap.indices) expect(targets[i]).toBe(want);
    }
  });

  it("only fills the tapped piece with symmetry off", () => {
    expect(guidedTap(piece, [piece], targets, want, {})).toEqual({
      kind: "fill",
      indices: [piece],
    });
  });

  it("says which colour a piece wants instead of filling it wrongly", () => {
    expect(guidedTap(piece, [piece], targets, other, {})).toEqual({ kind: "wrong", wants: want });
  });

  it("does nothing on a piece that's already done", () => {
    const fills = { [piece]: want };
    expect(guidedTap(piece, [piece], targets, want, fills)).toEqual({ kind: "done" });
    expect(guidedTap(piece, [piece], targets, other, fills)).toEqual({ kind: "done" });
  });

  it("skips symmetric copies that want a different colour", () => {
    const fake = [0, 1, 0];
    expect(guidedTap(0, [0, 1, 2], fake, 0, {})).toEqual({ kind: "fill", indices: [0, 2] });
  });
});

describe("remainingByColour, nextColour and guidedProgress", () => {
  const t = [0, 0, 1, 2, 2, 2];

  it("counts what's left per colour", () => {
    expect(remainingByColour(t, {}, 4)).toEqual([2, 1, 3, 0]);
    expect(remainingByColour(t, { 0: 0, 2: 1, 3: 0 }, 4)).toEqual([1, 0, 3, 0]);
  });

  it("keeps the colour while it has pieces, then moves on, wrapping round", () => {
    expect(nextColour([2, 1, 3, 0], 1)).toBe(1);
    expect(nextColour([2, 0, 3, 0], 1)).toBe(2);
    expect(nextColour([2, 0, 0, 0], 2)).toBe(0);
    expect(nextColour([0, 0, 1, 0], null)).toBe(2);
    expect(nextColour([0, 0, 0, 0], 1)).toBeNull();
  });

  it("measures progress by pieces in their intended colour", () => {
    expect(guidedProgress(t, {})).toBe(0);
    expect(guidedProgress(t, { 0: 0, 1: 1 })).toBeCloseTo(1 / 6);
    expect(guidedProgress(t, { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 2 })).toBe(1);
    expect(guidedProgress([], {})).toBe(0);
  });
});

it("hintFill tints towards the paper", () => {
  expect(hintFill("oklch(0.7 0.1 20)")).toBe(
    "color-mix(in oklch, oklch(0.7 0.1 20) 30%, var(--paper))",
  );
});
