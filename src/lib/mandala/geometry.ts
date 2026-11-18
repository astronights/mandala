/**
 * Small SVG path helpers in polar coordinates.
 *
 * Every shape is built in a "local" frame where the segment's axis lies along
 * angle 0. The renderer rotates copies of the shape around the centre, so we
 * only describe one segment's worth of geometry.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export function polar(r: number, theta: number): [number, number] {
  return [r2(r * Math.cos(theta)), r2(r * Math.sin(theta))];
}

export function pt(r: number, theta: number): string {
  const [x, y] = polar(r, theta);
  return `${x} ${y}`;
}

/** Annular sector between radii r0..r1 and angles -half..half. */
export function annularSector(r0: number, r1: number, half: number): string {
  if (r0 <= 0.01) {
    return [
      `M 0 0`,
      `L ${pt(r1, -half)}`,
      `A ${r2(r1)} ${r2(r1)} 0 0 1 ${pt(r1, half)}`,
      `Z`,
    ].join(" ");
  }
  const large = half * 2 > Math.PI ? 1 : 0;
  return [
    `M ${pt(r0, -half)}`,
    `L ${pt(r1, -half)}`,
    `A ${r2(r1)} ${r2(r1)} 0 ${large} 1 ${pt(r1, half)}`,
    `L ${pt(r0, half)}`,
    `A ${r2(r0)} ${r2(r0)} 0 ${large} 0 ${pt(r0, -half)}`,
    `Z`,
  ].join(" ");
}

export function circle(cx: number, cy: number, r: number): string {
  const R = r2(r);
  return `M ${r2(cx - r)} ${r2(cy)} a ${R} ${R} 0 1 0 ${r2(2 * r)} 0 a ${R} ${R} 0 1 0 ${r2(-2 * r)} 0 Z`;
}

export function circleAtPolar(r: number, theta: number, radius: number): string {
  const [x, y] = polar(r, theta);
  return circle(x, y, radius);
}

/**
 * Petal whose base sits on the arc at r0 and whose tip reaches r1.
 * `bulge` widens the belly, `tip` 0 = pointed, 1 = rounded (lotus).
 */
export function petal(r0: number, r1: number, hw: number, bulge: number, tip: number): string {
  const h = r1 - r0;
  const bellyR = r0 + h * 0.45;
  const bellyA = hw * (0.9 + 0.2 * bulge);
  const tipR = r1 - h * (0.28 - 0.2 * tip);
  const tipA = hw * (0.1 + 0.6 * tip);
  return [
    `M ${pt(r0, -hw)}`,
    `C ${pt(bellyR, -bellyA)} ${pt(tipR, -tipA)} ${pt(r1, 0)}`,
    `C ${pt(tipR, tipA)} ${pt(bellyR, bellyA)} ${pt(r0, hw)}`,
    `A ${r2(r0)} ${r2(r0)} 0 0 0 ${pt(r0, -hw)}`,
    `Z`,
  ].join(" ");
}

/** Leaf / vesica: pointed at both ends. */
export function leaf(r0: number, r1: number, hw: number, bulge: number): string {
  const h = r1 - r0;
  const a = r0 + h * 0.28;
  const b = r0 + h * 0.72;
  const k = hw * (1.05 + 0.25 * bulge);
  return [
    `M ${pt(r0, 0)}`,
    `C ${pt(a, -k)} ${pt(b, -k)} ${pt(r1, 0)}`,
    `C ${pt(b, k)} ${pt(a, k)} ${pt(r0, 0)}`,
    `Z`,
  ].join(" ");
}

/** Teardrop: rounded towards the centre, pointed outwards. */
export function teardrop(r0: number, r1: number, hw: number): string {
  const h = r1 - r0;
  const b = r0 + h * 0.18;
  return [
    `M ${pt(r1, 0)}`,
    `C ${pt(r0 + h * 0.55, -hw * 0.35)} ${pt(b + h * 0.12, -hw * 1.25)} ${pt(b, -hw * 0.55)}`,
    `C ${pt(r0 - h * 0.02, -hw * 0.2)} ${pt(r0 - h * 0.02, hw * 0.2)} ${pt(b, hw * 0.55)}`,
    `C ${pt(b + h * 0.12, hw * 1.25)} ${pt(r0 + h * 0.55, hw * 0.35)} ${pt(r1, 0)}`,
    `Z`,
  ].join(" ");
}

/**
 * Scallop: the band between r0 and an outward semicircular bump.
 * Returns null if the bump cannot fit inside r1.
 */
export function scallop(r0: number, r1: number, half: number): string | null {
  const s = Math.sin(half);
  const rm = r1 / (1 + s);
  if (rm <= r0 + (r1 - r0) * 0.15) return null;
  const rho = rm * s;
  return [
    `M ${pt(r0, -half)}`,
    `L ${pt(rm, -half)}`,
    `A ${r2(rho)} ${r2(rho)} 0 0 1 ${pt(rm, half)}`,
    `L ${pt(r0, half)}`,
    `A ${r2(r0)} ${r2(r0)} 0 0 0 ${pt(r0, -half)}`,
    `Z`,
  ].join(" ");
}

export function diamond(r0: number, r1: number, hw: number): string {
  const rm = (r0 + r1) / 2;
  return `M ${pt(r0, 0)} L ${pt(rm, -hw)} L ${pt(r1, 0)} L ${pt(rm, hw)} Z`;
}

/** Slender ray with its base on the arc at r0. */
export function ray(r0: number, r1: number, hw: number): string {
  return [
    `M ${pt(r0, -hw)}`,
    `L ${pt(r1, 0)}`,
    `L ${pt(r0, hw)}`,
    `A ${r2(r0)} ${r2(r0)} 0 0 0 ${pt(r0, -hw)}`,
    `Z`,
  ].join(" ");
}
