"use client";

import { SYMMETRY_OFF } from "@/lib/mandala";
import controls from "./controls.module.css";
import styles from "./ColouringBoard.module.css";

export function symmetryHint(k: number, n: number): string {
  if (k === SYMMETRY_OFF) return "One piece at a time";
  if (k === n) return "All matching pieces";
  return `${k} mirror line${k === 1 ? "" : "s"}`;
}

interface Props {
  options: number[];
  value: number;
  /** The mandala's own symmetry: the "all" option. */
  max: number;
  onChange: (k: number) => void;
  /** Hint wording for drawing ("Just this stroke") vs colouring. */
  hint?: (k: number, n: number) => string;
}

/** "Lines of symmetry": off, then each count the day's pattern supports. */
export function SymmetryPicker({ options, value, max, onChange, hint = symmetryHint }: Props) {
  return (
    <div className={styles.symmetry}>
      <div className={styles.symmetryHead}>
        <span className={styles.label} id="symmetry-label">
          Lines of symmetry
        </span>
        <span className={styles.hint} aria-live="polite">
          {hint(value, max)}
        </span>
      </div>
      <div className={controls.segmented} role="group" aria-labelledby="symmetry-label">
        {options.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            aria-label={k === SYMMETRY_OFF ? "No symmetry" : `${k} line${k === 1 ? "" : "s"}`}
            onClick={() => onChange(k)}
          >
            {k === SYMMETRY_OFF ? "off" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
