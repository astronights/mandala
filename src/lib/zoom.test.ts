import { describe, expect, it } from "vitest";
import {
  clampView,
  IDENTITY,
  isZoomed,
  MAX_SCALE,
  panBy,
  viewBoxFor,
  zoomAt,
  type View,
} from "./zoom";

const S = 400;

describe("zoomAt", () => {
  it("keeps the point under the fingers fixed", () => {
    const v = zoomAt(IDENTITY, 2, 100, 300, S);
    expect(v.scale).toBe(2);
    // Content point (100, 300) maps back to screen (100, 300).
    expect(100 * v.scale + v.x).toBeCloseTo(100);
    expect(300 * v.scale + v.y).toBeCloseTo(300);
  });

  it("clamps the scale between 1× and the maximum", () => {
    expect(zoomAt(IDENTITY, 0.5, 200, 200, S)).toEqual(IDENTITY);
    expect(zoomAt(IDENTITY, 100, 200, 200, S).scale).toBe(MAX_SCALE);
  });

  it("zooming back out returns to the full view", () => {
    const inV = zoomAt(IDENTITY, 3, 50, 50, S);
    expect(zoomAt(inV, 1 / 3, 300, 300, S)).toEqual(IDENTITY);
  });
});

describe("panBy and clampView", () => {
  it("cannot pan when not zoomed", () => {
    expect(panBy(IDENTITY, 50, -50, S)).toEqual(IDENTITY);
  });

  it("pans within the edges of the zoomed content", () => {
    const v: View = { scale: 2, x: -200, y: -200 };
    expect(panBy(v, 50, 0, S)).toEqual({ scale: 2, x: -150, y: -200 });
    expect(panBy(v, 999, 999, S)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(panBy(v, -999, -999, S)).toEqual({ scale: 2, x: -400, y: -400 });
  });

  it("repairs out-of-range views", () => {
    expect(clampView({ scale: 0.2, x: 10, y: 10 }, S)).toEqual(IDENTITY);
  });
});

describe("viewBoxFor", () => {
  it("shows the whole drawing at 1×", () => {
    expect(viewBoxFor(IDENTITY, S, 500)).toBe("-500 -500 1000 1000");
  });

  it("shows the matching quarter at 2×", () => {
    expect(viewBoxFor({ scale: 2, x: 0, y: 0 }, S, 500)).toBe("-500 -500 500 500");
    expect(viewBoxFor({ scale: 2, x: -400, y: -400 }, S, 500)).toBe("0 0 500 500");
    expect(viewBoxFor({ scale: 2, x: -200, y: -200 }, S, 500)).toBe("-250 -250 500 500");
  });
});

it("isZoomed ignores rounding noise", () => {
  expect(isZoomed(IDENTITY)).toBe(false);
  expect(isZoomed({ scale: 1.005, x: 0, y: 0 })).toBe(false);
  expect(isZoomed({ scale: 1.5, x: 0, y: 0 })).toBe(true);
});
