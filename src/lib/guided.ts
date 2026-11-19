import type { Mandala } from "@/lib/mandala";
import type { Fills } from "./colouring";

/**
 * Guided colouring: every piece has the colour the day's design gives it
 * (the generator's suggested colouring). People pick a colour, the pieces
 * that want it glow, and tapping fills them. Nothing can go wrong: a piece
 * that wants another colour simply isn't filled.
 */

/** Palette index each region should be, in region order. */
export function targetColours(m: Mandala): number[] {
  return m.regions.map((r) => m.suggested[r.group]);
}

export type GuidedTap =
  { kind: "fill"; indices: number[] } | { kind: "done" } | { kind: "wrong"; wants: number };

/**
 * What a tap on `index` does with `colour` selected. `orbit` is the set of
 * pieces symmetry would fill; only those wanting this colour and not yet
 * coloured are filled (copies can differ, e.g. alternating base cells).
 */
export function guidedTap(
  index: number,
  orbit: number[],
  targets: number[],
  colour: number,
  fills: Fills,
): GuidedTap {
  const wants = targets[index];
  if (wants !== colour) {
    return fills[index] === wants ? { kind: "done" } : { kind: "wrong", wants };
  }
  const indices = orbit.filter((i) => targets[i] === colour && fills[i] !== colour);
  return indices.length ? { kind: "fill", indices } : { kind: "done" };
}

/** Pieces still waiting for each colour. */
export function remainingByColour(targets: number[], fills: Fills, paletteSize: number): number[] {
  const out = new Array<number>(paletteSize).fill(0);
  targets.forEach((t, i) => {
    if (fills[i] !== t) out[t]++;
  });
  return out;
}

/** Keep the current colour while it has pieces left, else move to the next one that does. */
export function nextColour(remaining: number[], current: number | null): number | null {
  if (current !== null && remaining[current] > 0) return current;
  const start = current === null ? 0 : current + 1;
  for (let k = 0; k < remaining.length; k++) {
    const c = (start + k) % remaining.length;
    if (remaining[c] > 0) return c;
  }
  return null;
}

/** Share of pieces in their intended colour, 0..1. */
export function guidedProgress(targets: number[], fills: Fills): number {
  if (!targets.length) return 0;
  let done = 0;
  targets.forEach((t, i) => {
    if (fills[i] === t) done++;
  });
  return done / targets.length;
}

/** The soft tint shown on pieces waiting for the selected colour. */
export const hintFill = (css: string) => `color-mix(in oklch, ${css} 30%, var(--paper))`;
