/**
 * Zoom/pan maths for a square view of side `size` (CSS px).
 *
 * A view is a scale plus a translation (x, y ≤ 0) of the content, in px.
 * The content always covers the view: no panning past the edges.
 */

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
export const IDENTITY: View = { scale: 1, x: 0, y: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampView(v: View, size: number): View {
  const scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
  const min = size - size * scale;
  return { scale, x: clamp(v.x, min, 0), y: clamp(v.y, min, 0) };
}

/** Zoom by `factor`, keeping the point (px, py) of the view fixed under the finger. */
export function zoomAt(v: View, factor: number, px: number, py: number, size: number): View {
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / v.scale;
  return clampView({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, size);
}

export function panBy(v: View, dx: number, dy: number, size: number): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, size);
}

/** The SVG viewBox showing this view of a `[-r, r]²` drawing. */
export function viewBoxFor(v: View, size: number, r: number): string {
  const w = (2 * r) / v.scale;
  const x0 = (-v.x / v.scale / size) * 2 * r - r;
  const y0 = (-v.y / v.scale / size) * 2 * r - r;
  const f = (n: number) => Math.round(n * 100) / 100;
  return `${f(x0)} ${f(y0)} ${f(w)} ${f(w)}`;
}

export const isZoomed = (v: View) => v.scale > 1.01;
