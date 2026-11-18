import { DEFAULT_SEED, generateMandala, MANDALA_VERSION, type Mandala } from "./generate";

/** What gets recorded about a day's mandala (see daily_mandalas). */
export interface MandalaSummary {
  date: string;
  version: number;
  seed: string;
  symmetry: number;
  ringCount: number;
  motifs: string[];
  pieceCount: number;
  groupCount: number;
  paletteScheme: string;
  palette: string[];
}

export function summarize(m: Mandala): MandalaSummary {
  return {
    date: m.date,
    version: m.version,
    seed: m.seed,
    symmetry: m.symmetry,
    ringCount: m.rings.length,
    motifs: m.rings.map((r) => r.motif),
    pieceCount: m.regions.length,
    groupCount: m.groups.length,
    paletteScheme: m.palette.scheme,
    palette: m.palette.colours.map((c) => c.css),
  };
}

export function summarizeDay(
  date: string,
  seed: string = DEFAULT_SEED,
  version: number = MANDALA_VERSION,
): MandalaSummary {
  return summarize(generateMandala(date, seed, version));
}
