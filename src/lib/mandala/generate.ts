import { createRng, type Rng } from "./random";
import { generatePalette, type Palette } from "./palette";
import * as g from "./geometry";

/**
 * Daily mandala generator.
 *
 * generateMandala(date, seed) is a pure function: the same inputs give the
 * same mandala everywhere, so nothing about the pattern ever needs storing.
 *
 * Output model
 *  - shapes:  unique path outlines for ONE segment (local frame, axis at 0°)
 *  - regions: placed copies (shape + rotation) in paint order
 *  - groups:  a colourable unit; every region in a group shares one fill,
 *             which is what makes a single tap colour all segments at once
 */

export const MANDALA_VERSION = 1;
export const DEFAULT_SEED = "mandala";
export const VIEW_RADIUS = 500;
const OUTER_RADIUS = 472;

export type MotifKind =
  | "petal"
  | "lotus"
  | "leaf"
  | "teardrop"
  | "scallop"
  | "dots"
  | "diamond"
  | "rays";

export type GroupRole = "base" | "motif" | "accent" | "centre";

export interface Shape {
  id: string;
  d: string;
}

export interface Region {
  shape: string;
  group: string;
  rotate: number; // degrees, in the local frame
}

export interface Group {
  id: string;
  ring: number;
  role: GroupRole;
}

export interface RingSpec {
  index: number;
  r0: number;
  r1: number;
  motif: MotifKind | "centre";
  perSegment: number;
  offset: boolean;
  rim: boolean;
}

export interface Mandala {
  version: number;
  date: string;
  seed: string;
  symmetry: number;
  rings: RingSpec[];
  shapes: Shape[];
  regions: Region[];
  groups: Group[];
  palette: Palette;
  /** A pleasing default colouring: group id -> palette index. */
  suggested: Record<string, number>;
}

class Builder {
  shapes: Shape[] = [];
  regions: Region[] = [];
  groups: Group[] = [];
  private shapeCount = 0;

  constructor(readonly symmetry: number) {}

  group(id: string, ring: number, role: GroupRole): string {
    if (!this.groups.some((gr) => gr.id === id)) this.groups.push({ id, ring, role });
    return id;
  }

  shape(d: string): string {
    const id = `s${this.shapeCount++}`;
    this.shapes.push({ id, d });
    return id;
  }

  /** Place a shape once in every segment, rotated by `offsetDeg`. */
  repeat(shape: string, group: string, offsetDeg = 0, groupFor?: (k: number) => string) {
    const seg = 360 / this.symmetry;
    for (let k = 0; k < this.symmetry; k++) {
      this.regions.push({
        shape,
        group: groupFor ? groupFor(k) : group,
        rotate: Math.round((k * seg + offsetDeg) * 1000) / 1000,
      });
    }
  }

  single(shape: string, group: string) {
    this.regions.push({ shape, group, rotate: 0 });
  }
}

const MOTIFS: readonly (readonly [MotifKind, number])[] = [
  ["petal", 3],
  ["lotus", 2.5],
  ["leaf", 2],
  ["teardrop", 1.5],
  ["scallop", 2],
  ["dots", 1.5],
  ["diamond", 1.5],
  ["rays", 1],
];

const RIM_MOTIFS: readonly (readonly [MotifKind, number])[] = [
  ["petal", 3],
  ["lotus", 3],
  ["scallop", 2],
  ["teardrop", 1],
];

function ringRadii(rng: Rng, count: number, inner: number, outer: number): number[] {
  // Widths drift gently larger or smaller towards the rim for a deliberate feel.
  const growth = rng.range(-0.06, 0.16);
  const weights = Array.from({ length: count }, (_, i) => rng.range(0.75, 1.3) * (1 + growth * i));
  const total = weights.reduce((a, b) => a + b, 0);
  const radii = [inner];
  let acc = inner;
  for (const w of weights) {
    acc += ((outer - inner) * w) / total;
    radii.push(acc);
  }
  return radii;
}

function drawMotif(
  b: Builder,
  rng: Rng,
  ring: RingSpec,
  kind: MotifKind,
  segAngle: number,
): MotifKind {
  const { r0, r1, index, perSegment } = ring;
  const slot = segAngle / perSegment;
  const offsetDeg = ring.offset ? (segAngle / 2) * (180 / Math.PI) : 0;
  const slotCentres = Array.from({ length: perSegment }, (_, j) => (j + 0.5) * slot - segAngle / 2);
  const main = b.group(`r${index}-motif`, index, "motif");
  const h = r1 - r0;
  const pad = h * 0.06;

  const place = (d: string, group: string) => {
    for (const c of slotCentres) {
      const id = b.shape(d);
      b.repeat(id, group, offsetDeg + (c * 180) / Math.PI);
    }
  };

  const wantsAccent = rng.chance(0.55);

  switch (kind) {
    case "scallop": {
      const d = g.scallop(r0, r1, slot / 2);
      if (!d) return drawMotif(b, rng, ring, "petal", segAngle);
      place(d, main);
      if (wantsAccent) {
        const rm = r1 / (1 + Math.sin(slot / 2));
        const dotR = Math.min(rm * Math.sin(slot / 2) * 0.42, h * 0.28);
        place(g.circleAtPolar(rm, 0, dotR), b.group(`r${index}-accent`, index, "accent"));
      }
      return "scallop";
    }
    case "petal":
    case "lotus": {
      const hw = (slot / 2) * rng.range(0.78, 0.97);
      const tip = kind === "lotus" ? rng.range(0.6, 1) : rng.range(0, 0.15);
      const bulge = rng.range(0, 1);
      place(g.petal(r0, r1 - pad * 0.5, hw, bulge, tip), main);
      if (wantsAccent) {
        const inner = r0 + h * rng.range(0.5, 0.7);
        place(g.petal(r0, inner, hw * 0.5, bulge, tip), b.group(`r${index}-accent`, index, "accent"));
      }
      return kind;
    }
    case "leaf": {
      const hw = (slot / 2) * rng.range(0.6, 0.85);
      place(g.leaf(r0 + pad, r1 - pad, hw, rng.range(0, 1)), main);
      if (wantsAccent) {
        place(
          g.leaf(r0 + h * 0.3, r1 - h * 0.25, hw * 0.4, 0.5),
          b.group(`r${index}-accent`, index, "accent"),
        );
      }
      return "leaf";
    }
    case "teardrop": {
      const hw = (slot / 2) * rng.range(0.6, 0.85);
      place(g.teardrop(r0 + pad, r1 - pad, hw), main);
      if (wantsAccent) {
        const cr = r0 + pad + h * 0.24;
        const dotR = Math.min(cr * Math.sin(hw) * 0.4, h * 0.1);
        place(g.circleAtPolar(cr, 0, dotR), b.group(`r${index}-accent`, index, "accent"));
      }
      return "teardrop";
    }
    case "dots": {
      const rm = (r0 + r1) / 2;
      const dotR = Math.min(h * 0.34, rm * Math.sin(slot / 2) * 0.8);
      place(g.circleAtPolar(rm, 0, dotR), main);
      if (wantsAccent && dotR > 8) {
        place(g.circleAtPolar(rm, 0, dotR * 0.45), b.group(`r${index}-accent`, index, "accent"));
      }
      return "dots";
    }
    case "diamond": {
      const hw = (slot / 2) * rng.range(0.7, 0.95);
      place(g.diamond(r0 + pad, r1 - pad, hw), main);
      if (wantsAccent) {
        const rm = (r0 + r1) / 2;
        const dotR = Math.min(h * 0.12, rm * Math.sin(hw) * 0.3);
        place(g.circleAtPolar(rm, 0, dotR), b.group(`r${index}-accent`, index, "accent"));
      }
      return "diamond";
    }
    case "rays": {
      const hw = (slot / 2) * rng.range(0.3, 0.5);
      place(g.ray(r0, r1 - pad, hw), main);
      if (wantsAccent) {
        // Small dots between the rays.
        const rm = r0 + h * 0.62;
        const dotR = Math.min(h * 0.1, rm * Math.sin(slot / 2 - hw) * 0.35);
        if (dotR > 2) {
          const id = b.shape(g.circleAtPolar(rm, slot / 2, dotR));
          const accent = b.group(`r${index}-accent`, index, "accent");
          for (const c of slotCentres) b.repeat(id, accent, offsetDeg + (c * 180) / Math.PI);
        }
      }
      return "rays";
    }
  }
}

function suggestColouring(rng: Rng, groups: Group[], paletteSize: number): Record<string, number> {
  const out: Record<string, number> = {};
  const ringBase: Record<number, number> = {};
  let prevBase = -1;
  for (const gr of groups) {
    const avoid = new Set<number>();
    if (gr.role === "base" || gr.role === "centre") avoid.add(prevBase);
    if (ringBase[gr.ring] !== undefined) avoid.add(ringBase[gr.ring]);
    const motif = out[`r${gr.ring}-motif`];
    if (gr.role === "accent" && motif !== undefined) avoid.add(motif);
    const choices = Array.from({ length: paletteSize }, (_, i) => i).filter((i) => !avoid.has(i));
    const idx = rng.pick(choices);
    out[gr.id] = idx;
    if (gr.role === "base" && ringBase[gr.ring] === undefined) {
      ringBase[gr.ring] = idx;
      prevBase = idx;
    }
  }
  return out;
}

export function generateMandala(date: string, seed: string = DEFAULT_SEED): Mandala {
  const rng = createRng(`v${MANDALA_VERSION}|${seed}|${date}`);

  const symmetry = rng.weighted<number>([
    [6, 2],
    [8, 3],
    [10, 1.5],
    [12, 3],
    [16, 2],
  ]);
  const segAngle = (2 * Math.PI) / symmetry;
  const palette = generatePalette(rng);
  const b = new Builder(symmetry);

  const ringCount = rng.int(4, 7); // excluding the centre
  const centreR = OUTER_RADIUS * rng.range(0.1, 0.16);
  const radii = ringRadii(rng, ringCount, centreR, OUTER_RADIUS);
  const rings: RingSpec[] = [];

  // ── Centre: a disc, a rosette and a seed dot ────────────────────────────
  {
    const base = b.group("r0-base", 0, "centre");
    b.single(b.shape(g.circle(0, 0, centreR)), base);
    const rosette = b.group("r0-motif", 0, "motif");
    const hw = (segAngle / 2) * rng.range(0.55, 0.85);
    b.repeat(b.shape(g.leaf(centreR * 0.22, centreR * 0.94, hw, rng.next())), rosette);
    const dot = b.group("r0-accent", 0, "accent");
    b.single(b.shape(g.circle(0, 0, centreR * 0.26)), dot);
    rings.push({ index: 0, r0: 0, r1: centreR, motif: "centre", perSegment: 1, offset: false, rim: false });
  }

  // ── Bands ────────────────────────────────────────────────────────────────
  let prevMotif: MotifKind | null = null;
  for (let i = 1; i <= ringCount; i++) {
    const r0 = radii[i - 1];
    const r1 = radii[i];
    const rim = i === ringCount;
    const mid = (r0 + r1) / 2;
    const arcWidth = mid * segAngle;
    const perSegment = !rim && arcWidth > (r1 - r0) * 2.2 && rng.chance(0.5) ? 2 : 1;

    let kind: MotifKind;
    do {
      kind = rng.weighted(rim ? RIM_MOTIFS : MOTIFS);
    } while (kind === prevMotif);
    // Rays look thin and lost in narrow inner bands.
    if (kind === "rays" && r1 - r0 < 40) kind = "petal";

    const ring: RingSpec = {
      index: i,
      r0,
      r1,
      motif: kind,
      perSegment,
      offset: rng.chance(0.4),
      rim,
    };

    if (rim) {
      // The rim has no band behind it, so the silhouette is made of petals.
      // An optional offset back layer peeks out between the front petals.
      if (rng.chance(0.65)) {
        const back = b.group(`r${i}-back`, i, "motif");
        const hw = (segAngle / 2) * rng.range(0.85, 0.98);
        const id = b.shape(g.petal(r0, r1, hw, rng.next(), rng.range(0, 0.3)));
        b.repeat(id, back, ring.offset ? 0 : (segAngle / 2) * (180 / Math.PI));
        ring.r1 = r0 + (r1 - r0) * rng.range(0.8, 0.9);
      }
    } else {
      const alternate = symmetry % 2 === 0 && rng.chance(0.3);
      const baseA = b.group(`r${i}-base`, i, "base");
      const baseB = alternate ? b.group(`r${i}-base-alt`, i, "base") : baseA;
      const id = b.shape(g.annularSector(r0, r1, segAngle / 2));
      b.repeat(id, baseA, 0, (k) => (k % 2 === 0 ? baseA : baseB));
    }

    ring.motif = drawMotif(b, rng, ring, kind, segAngle);
    ring.r1 = r1;
    rings.push(ring);
    prevMotif = ring.motif as MotifKind;
  }

  // Paint order: rim first (it sits behind nothing), then inward. Within a
  // ring, regions are already ordered base → motif → accent.
  const ringOf = new Map(b.groups.map((gr) => [gr.id, gr.ring]));
  const order = b.regions
    .map((r, i) => ({ r, i, ring: ringOf.get(r.group) ?? 0 }))
    .sort((a, z) => z.ring - a.ring || a.i - z.i)
    .map(({ r }) => r);

  const suggested = suggestColouring(rng, b.groups, palette.colours.length);

  return {
    version: MANDALA_VERSION,
    date,
    seed,
    symmetry,
    rings,
    shapes: b.shapes,
    regions: order,
    groups: b.groups,
    palette,
    suggested,
  };
}
