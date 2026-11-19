/**
 * Symmetric drawing over the day's mandala.
 *
 * A stroke is drawn once and shown in every symmetric copy: k rotations by
 * 360°/k, each also mirrored. The mirror lines are the mandala's own (the
 * vertical axis and its rotations), so drawings line up with the pattern.
 * Points are in the SVG's view coordinates ([-500, 500]², centre at 0).
 */

export interface Stroke {
  /** Palette index. */
  c: number;
  /** Lines of symmetry when drawn (0 = just this stroke). */
  k: number;
  /** Flattened [x0, y0, x1, y1, ...], in half-units (integers) to stay compact. */
  p: number[];
}

/** Stored precision: half a unit, ~0.2px on a phone at 1×, still smooth at 6×. */
const PRECISION = 2;
export const BRUSH_WIDTH = 5;
/** Stop runaway strokes from growing storage without bound. */
export const MAX_POINTS = 600;

export type Point = [number, number];

export function encodePoints(points: Point[]): number[] {
  return points.flatMap(([x, y]) => [Math.round(x * PRECISION), Math.round(y * PRECISION)]);
}

export function decodePoints(p: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i] / PRECISION, p[i + 1] / PRECISION]);
  return out;
}

/** Ramer–Douglas–Peucker: drop points that don't change the line's shape. */
export function simplify(points: Point[], tolerance = 0.8): Point[] {
  if (points.length <= 2) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  let maxDist = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dist =
      len === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

const f = (n: number) => Math.round(n * 100) / 100;

/** A smooth path through the points (quadratic curves through midpoints). */
export function strokePath(points: Point[]): string {
  if (points.length === 0) return "";
  const [x0, y0] = points[0];
  // A tap leaves a dot: a zero-length line with round caps.
  if (points.length === 1) return `M ${f(x0)} ${f(y0)} l 0.01 0`;
  if (points.length === 2) return `M ${f(x0)} ${f(y0)} L ${f(points[1][0])} ${f(points[1][1])}`;
  let d = `M ${f(x0)} ${f(y0)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q ${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L ${f(lx)} ${f(ly)}`;
}

/** SVG transforms for every symmetric copy of a stroke drawn with k lines. */
export function symmetryTransforms(k: number): string[] {
  if (k <= 0) return [""];
  const out: string[] = [];
  for (let j = 0; j < k; j++) {
    const a = f((j * 360) / k);
    out.push(a ? `rotate(${a})` : "", a ? `rotate(${a}) scale(-1 1)` : "scale(-1 1)");
  }
  return out;
}

/** Turn raw pointer samples into a stored stroke. */
export function makeStroke(raw: Point[], colour: number, lines: number): Stroke {
  let points = simplify(raw);
  if (points.length > MAX_POINTS) points = points.slice(0, MAX_POINTS);
  return { c: colour, k: lines, p: encodePoints(points) };
}

export function isStroke(v: unknown): v is Stroke {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    Number.isInteger(s.c) &&
    (s.c as number) >= 0 &&
    Number.isInteger(s.k) &&
    (s.k as number) >= 0 &&
    (s.k as number) <= 64 &&
    Array.isArray(s.p) &&
    s.p.length >= 2 &&
    s.p.length % 2 === 0 &&
    s.p.length <= MAX_POINTS * 2 &&
    s.p.every((n) => Number.isInteger(n) && Math.abs(n) <= 500 * PRECISION * 2)
  );
}

/* ── Strokes with undo ─────────────────────────────────────────────────── */

export interface DrawState {
  strokes: Stroke[];
  past: Stroke[][];
  future: Stroke[][];
}

export type DrawAction =
  | { type: "add"; stroke: Stroke }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "load"; strokes: Stroke[] };

const HISTORY = 100;

export const initialDraw = (strokes: Stroke[] = []): DrawState => ({
  strokes,
  past: [],
  future: [],
});

export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  const commit = (strokes: Stroke[]): DrawState => ({
    strokes,
    past: [...state.past, state.strokes].slice(-HISTORY),
    future: [],
  });
  switch (action.type) {
    case "add":
      return commit([...state.strokes, action.stroke]);
    case "undo":
      if (!state.past.length) return state;
      return {
        strokes: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.strokes, ...state.future],
      };
    case "redo": {
      if (!state.future.length) return state;
      const [next, ...future] = state.future;
      return { strokes: next, past: [...state.past, state.strokes], future };
    }
    case "clear":
      return state.strokes.length ? commit([]) : state;
    case "load":
      return initialDraw(action.strokes);
  }
}
