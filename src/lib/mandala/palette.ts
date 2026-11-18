import type { Rng } from "./random";

/**
 * Soft, harmonious palettes generated in OKLCH. OKLCH is perceptually
 * uniform, so keeping chroma low and lightness high gives calm colours that
 * never clash, whatever hue the day lands on.
 */

export interface PaletteColour {
  l: number; // 0..1
  c: number; // 0..~0.37
  h: number; // degrees
  css: string;
}

export interface Palette {
  scheme: PaletteScheme;
  colours: PaletteColour[];
}

export type PaletteScheme = "analogous" | "complementary" | "triadic" | "split" | "monochrome";

const SCHEME_OFFSETS: Record<PaletteScheme, number[]> = {
  analogous: [0, 28, -28, 52, 14, -14],
  complementary: [0, 180, 24, 200, -16, 164],
  triadic: [0, 120, 240, 20, 140, 260],
  split: [0, 150, 210, 18, 165, 195],
  monochrome: [0, 8, -8, 14, -4, 4],
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function makeColour(l: number, c: number, h: number): PaletteColour {
  const hue = ((h % 360) + 360) % 360;
  return { l: r3(l), c: r3(c), h: r3(hue), css: `oklch(${r3(l)} ${r3(c)} ${r3(hue)})` };
}

export function generatePalette(rng: Rng, size = 6): Palette {
  const scheme = rng.weighted<PaletteScheme>([
    ["analogous", 3],
    ["complementary", 2],
    ["triadic", 1.5],
    ["split", 2],
    ["monochrome", 1],
  ]);
  const baseHue = rng.range(0, 360);
  const offsets = SCHEME_OFFSETS[scheme];
  const chromaBase = rng.range(0.045, 0.095);

  // Spread lightness evenly between a soft mid-tone and near-paper.
  const lMin = rng.range(0.58, 0.66);
  const lMax = rng.range(0.9, 0.95);

  const colours: PaletteColour[] = [];
  for (let i = 0; i < size; i++) {
    const t = size === 1 ? 0 : i / (size - 1);
    const l = lMin + (lMax - lMin) * t + rng.range(-0.02, 0.02);
    // Lighter colours carry less chroma so they read as pastel, not neon.
    const c = chromaBase * (1.15 - 0.55 * t) + rng.range(-0.01, 0.01);
    const h = baseHue + offsets[i % offsets.length] + rng.range(-6, 6);
    colours.push(makeColour(l, Math.max(0.015, c), h));
  }

  // Shuffle so the darkest colour isn't always the "first" hue.
  for (let i = colours.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [colours[i], colours[j]] = [colours[j], colours[i]];
  }

  return { scheme, colours };
}
