import type { Mandala } from "./generate";

/**
 * Symmetry assist.
 *
 * Every mandala has n-fold dihedral symmetry (n mirror lines, n rotations).
 * The user chooses how many lines of symmetry k to "help" with:
 *
 *   k = 0   → off: a tap fills only the piece you touched
 *   k | n   → a tap fills that piece's orbit under the dihedral group D_k
 *             (k rotations by 360/k plus k reflections)
 *   k = n   → full assist: every identical piece in the mandala. This can
 *             exceed the D_n orbit when a ring has more local symmetry than
 *             the whole pattern (e.g. 16 dots in an 8-fold mandala), which is
 *             what "fill all of these at once" should mean to a person.
 *
 * Only divisors of n are offered, because those are exactly the line counts
 * the pattern itself is symmetric under.
 */

export const SYMMETRY_OFF = 0;
const EPS = 0.01; // degrees

export function symmetryOptions(n: number): number[] {
  const out = [SYMMETRY_OFF];
  for (let k = 1; k <= n; k++) if (n % k === 0) out.push(k);
  return out;
}

/** Clamp a remembered preference to the nearest option available today. */
export function nearestSymmetry(n: number, wanted: number): number {
  const options = symmetryOptions(n);
  if (wanted >= n) return n;
  return options.reduce((best, k) => (Math.abs(k - wanted) < Math.abs(best - wanted) ? k : best));
}

/** Mirror-line angles (degrees, local frame) for drawing guides. */
export function symmetryAxes(k: number): number[] {
  return Array.from({ length: k }, (_, m) => (m * 180) / k);
}

const norm = (a: number) => ((a % 360) + 360) % 360;
const sameAngle = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return d < EPS || 360 - d < EPS;
};

/**
 * Precomputed lookup so each tap resolves in O(copies) rather than O(regions).
 * Regions are equivalent when they have identical geometry, so this works
 * across colour groups (e.g. alternating base cells).
 */
export class SymmetryIndex {
  private byGeometry = new Map<string, { index: number; angle: number }[]>();
  private geometryOf: string[] = [];

  constructor(readonly mandala: Mandala) {
    const d = new Map(mandala.shapes.map((s) => [s.id, s.d]));
    mandala.regions.forEach((r, index) => {
      const key = d.get(r.shape) ?? r.shape;
      this.geometryOf[index] = key;
      let list = this.byGeometry.get(key);
      if (!list) this.byGeometry.set(key, (list = []));
      list.push({ index, angle: r.rotate });
    });
  }

  /** All region indices a tap on `index` should fill, sorted ascending. */
  orbit(index: number, k: number): number[] {
    const region = this.mandala.regions[index];
    if (!region) return [];
    if (k <= SYMMETRY_OFF) return [index];
    const candidates = this.byGeometry.get(this.geometryOf[index]) ?? [];
    if (k >= this.mandala.symmetry) return candidates.map((c) => c.index).sort((x, y) => x - y);

    const a = region.rotate;
    const step = 360 / k;
    const targets: number[] = [];
    for (let m = 0; m < k; m++) {
      targets.push(a + m * step); // rotations
      targets.push(m * step - a); // reflections across axes at m·180/k
    }

    const out = new Set<number>([index]);
    for (const c of candidates) {
      if (targets.some((t) => sameAngle(t, c.angle))) out.add(c.index);
    }
    return [...out].sort((x, y) => x - y);
  }
}
