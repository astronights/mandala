import { describe, expect, it } from "vitest";
import {
  decodePoints,
  drawReducer,
  encodePoints,
  initialDraw,
  isStroke,
  makeStroke,
  MAX_POINTS,
  simplify,
  strokePath,
  symmetryTransforms,
  type Point,
  type Stroke,
} from "./draw";

describe("encode/decode", () => {
  it("round-trips to half a unit", () => {
    const pts: Point[] = [
      [10.24, -3.76],
      [0, 499.9],
    ];
    expect(encodePoints(pts)).toEqual([20, -8, 0, 1000]);
    expect(decodePoints(encodePoints(pts))).toEqual([
      [10, -4],
      [0, 500],
    ]);
  });
});

describe("simplify", () => {
  it("drops points on a straight line and keeps corners", () => {
    const line: Point[] = Array.from({ length: 20 }, (_, i) => [i, i]);
    expect(simplify(line)).toEqual([
      [0, 0],
      [19, 19],
    ]);
    const corner: Point[] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
    ];
    expect(simplify(corner)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("handles closed loops and short input", () => {
    expect(simplify([[1, 1]])).toEqual([[1, 1]]);
    const loop: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0],
    ];
    expect(simplify(loop).length).toBeGreaterThan(2);
  });
});

describe("strokePath", () => {
  it("draws a dot, a line, or a smooth curve", () => {
    expect(strokePath([])).toBe("");
    expect(strokePath([[1, 2]])).toBe("M 1 2 l 0.01 0");
    expect(
      strokePath([
        [0, 0],
        [10, 0],
      ]),
    ).toBe("M 0 0 L 10 0");
    expect(
      strokePath([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toBe("M 0 0 Q 10 0 10 5 L 10 10");
  });
});

describe("symmetryTransforms", () => {
  it("is a single copy with symmetry off", () => {
    expect(symmetryTransforms(0)).toEqual([""]);
  });

  it("gives k rotations, each with its mirror image", () => {
    expect(symmetryTransforms(1)).toEqual(["", "scale(-1 1)"]);
    const t = symmetryTransforms(4);
    expect(t).toHaveLength(8);
    expect(t).toContain("rotate(90)");
    expect(t).toContain("rotate(270) scale(-1 1)");
  });
});

describe("makeStroke and isStroke", () => {
  it("stores a simplified, valid stroke", () => {
    const raw: Point[] = Array.from({ length: 50 }, (_, i) => [i, 2 * i]);
    const s = makeStroke(raw, 2, 8);
    expect(s).toEqual({ c: 2, k: 8, p: [0, 0, 98, 196] });
    expect(isStroke(s)).toBe(true);
  });

  it("caps runaway strokes", () => {
    const zigzag: Point[] = Array.from({ length: 3000 }, (_, i) => [i % 400, (i % 2) * 50]);
    expect(makeStroke(zigzag, 0, 0).p.length).toBeLessThanOrEqual(MAX_POINTS * 2);
  });

  it.each([
    null,
    { c: -1, k: 0, p: [0, 0] },
    { c: 0, k: 99, p: [0, 0] },
    { c: 0, k: 0, p: [0] },
    { c: 0, k: 0, p: [0, 1.5] },
    { c: 0, k: 0, p: [0, 99999] },
  ])("rejects %j", (v) => expect(isStroke(v)).toBe(false));
});

describe("drawReducer", () => {
  const a: Stroke = { c: 0, k: 0, p: [0, 0, 2, 2] };
  const b: Stroke = { c: 1, k: 4, p: [4, 4, 6, 6] };

  it("adds, undoes, redoes and clears", () => {
    let s = initialDraw();
    s = drawReducer(s, { type: "add", stroke: a });
    s = drawReducer(s, { type: "add", stroke: b });
    expect(s.strokes).toEqual([a, b]);
    s = drawReducer(s, { type: "undo" });
    expect(s.strokes).toEqual([a]);
    s = drawReducer(s, { type: "redo" });
    expect(s.strokes).toEqual([a, b]);
    s = drawReducer(s, { type: "clear" });
    expect(s.strokes).toEqual([]);
    s = drawReducer(s, { type: "undo" });
    expect(s.strokes).toEqual([a, b]);
  });

  it("ignores no-ops and resets history on load", () => {
    const empty = initialDraw();
    expect(drawReducer(empty, { type: "undo" })).toBe(empty);
    expect(drawReducer(empty, { type: "redo" })).toBe(empty);
    expect(drawReducer(empty, { type: "clear" })).toBe(empty);
    const loaded = drawReducer(drawReducer(empty, { type: "add", stroke: a }), {
      type: "load",
      strokes: [b],
    });
    expect(loaded).toEqual({ strokes: [b], past: [], future: [] });
  });
});
