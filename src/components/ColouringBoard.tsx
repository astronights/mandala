"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  nearestSymmetry,
  SymmetryIndex,
  symmetryAxes,
  symmetryOptions,
  SYMMETRY_OFF,
  type Mandala,
} from "@/lib/mandala";
import { colouringReducer, initialColouring, progress, type Fills } from "@/lib/colouring";
import {
  loadPreferences,
  loadProgress,
  savePreferences,
  saveProgress,
} from "@/lib/storage/progress";
import { PlayTracker } from "@/lib/activity/tracker";
import { MandalaSvg } from "./MandalaSvg";
import controls from "./controls.module.css";
import styles from "./ColouringBoard.module.css";

const FULL_SYMMETRY = 1000; // stored preference meaning "as many lines as the day allows"
const GUIDE_MS = 1800;

interface Props {
  mandala: Mandala;
  /** Disable persistence (tests, admin previews). */
  persist?: boolean;
  /** Report anonymous activity (defaults to `persist`). */
  track?: boolean;
}

export function symmetryHint(k: number, n: number): string {
  if (k === SYMMETRY_OFF) return "Colour each piece by hand";
  if (k === n) return "Every matching piece fills at once";
  return `Mirrored across ${k} line${k === 1 ? "" : "s"}`;
}

export function ColouringBoard({ mandala, persist = true, track = persist }: Props) {
  const n = mandala.symmetry;
  const options = useMemo(() => symmetryOptions(n), [n]);
  const index = useMemo(() => new SymmetryIndex(mandala), [mandala]);

  const [state, dispatch] = useReducer(colouringReducer, undefined, () => initialColouring());
  const [colour, setColour] = useState<number | null>(0);
  const [lines, setLines] = useState(n);
  const [guidesVisible, setGuidesVisible] = useState(false);
  const [loaded, setLoaded] = useState(!persist);
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracker = useRef<PlayTracker | null>(null);
  // Bumped by user actions only, so loading saved work isn't reported as play.
  const [interactions, setInteractions] = useState(0);
  const interacted = () => setInteractions((c) => c + 1);

  useEffect(() => {
    if (!track) return;
    const t = new PlayTracker({ date: mandala.date, version: mandala.version, mode: "colour" });
    tracker.current = t;
    const hide = () => {
      if (document.visibilityState === "hidden") t.flush({ beacon: true });
    };
    const leave = () => t.flush({ beacon: true });
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      t.dispose();
      tracker.current = null;
    };
  }, [track, mandala.date, mandala.version]);

  // Restore saved work and preferences for this day.
  useEffect(() => {
    if (!persist) return;
    const saved = loadProgress(mandala.date);
    if (saved) {
      const fills: Record<number, number> = {};
      for (const [k, v] of Object.entries(saved.fills)) {
        if (Number(k) < mandala.regions.length && v < mandala.palette.colours.length)
          fills[Number(k)] = v;
      }
      dispatch({ type: "load", fills });
    } else {
      dispatch({ type: "load", fills: {} });
    }
    const prefs = loadPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(nearestSymmetry(n, prefs ? prefs.symmetry : FULL_SYMMETRY));
    setLoaded(true);
  }, [persist, mandala, n]);

  useEffect(() => {
    if (persist && loaded) saveProgress(mandala.date, state.fills as Record<number, number>);
  }, [persist, loaded, mandala.date, state.fills]);

  useEffect(() => {
    if (interactions === 0) return;
    tracker.current?.interact({
      progress: progress(state.fills, mandala.regions.length),
      symmetryLines: lines,
    });
    // Only user actions should report; fills and lines are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactions]);

  useEffect(
    () => () => {
      if (guideTimer.current) clearTimeout(guideTimer.current);
    },
    [],
  );

  const chooseLines = (k: number) => {
    setLines(k);
    interacted();
    if (persist) savePreferences({ symmetry: k === n ? FULL_SYMMETRY : k });
    setGuidesVisible(k > SYMMETRY_OFF);
    if (guideTimer.current) clearTimeout(guideTimer.current);
    guideTimer.current = setTimeout(() => setGuidesVisible(false), GUIDE_MS);
  };

  const onRegionTap = useCallback(
    (i: number) => {
      dispatch({ type: "paint", indices: index.orbit(i, lines), colour });
      setInteractions((c) => c + 1);
    },
    [index, lines, colour],
  );

  const regionFills = useMemo(() => {
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(state.fills as Fills)) {
      out[Number(k)] = mandala.palette.colours[v]?.css;
    }
    return out;
  }, [state.fills, mandala.palette.colours]);

  const pct = Math.round(progress(state.fills, mandala.regions.length) * 100);

  return (
    <div className={styles.board}>
      <div className={styles.art}>
        <MandalaSvg
          mandala={mandala}
          regionFills={regionFills}
          onRegionTap={onRegionTap}
          guides={symmetryAxes(lines)}
          guidesVisible={guidesVisible}
          className={styles.svg}
          title="Today's mandala. Tap a piece to colour it."
        />
      </div>

      <div className={styles.palette} role="radiogroup" aria-label="Colour">
        {mandala.palette.colours.map((c, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={colour === i}
            aria-label={`Colour ${i + 1}`}
            className={styles.swatch}
            style={{ background: c.css }}
            onClick={() => setColour(i)}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={colour === null}
          aria-label="Eraser"
          className={`${styles.swatch} ${styles.eraser}`}
          onClick={() => setColour(null)}
        />
      </div>

      <div className={styles.symmetry}>
        <span className={styles.label} id="symmetry-label">
          Lines of symmetry
        </span>
        <div className={controls.segmented} role="group" aria-labelledby="symmetry-label">
          {options.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={lines === k}
              aria-label={k === SYMMETRY_OFF ? "No symmetry" : `${k} line${k === 1 ? "" : "s"}`}
              onClick={() => chooseLines(k)}
            >
              {k === SYMMETRY_OFF ? "off" : k}
            </button>
          ))}
        </div>
        <span className={styles.hint} aria-live="polite">
          {symmetryHint(lines, n)}
        </span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={controls.textButton}
          disabled={state.past.length === 0}
          onClick={() => {
            dispatch({ type: "undo" });
            interacted();
          }}
        >
          Undo
        </button>
        <button
          type="button"
          className={controls.textButton}
          disabled={state.future.length === 0}
          onClick={() => {
            dispatch({ type: "redo" });
            interacted();
          }}
        >
          Redo
        </button>
        <button
          type="button"
          className={controls.textButton}
          disabled={Object.keys(state.fills).length === 0}
          onClick={() => {
            dispatch({ type: "clear" });
            interacted();
          }}
        >
          Clear
        </button>
        <span className={styles.progress} data-testid="progress">
          {pct}% coloured
        </span>
      </div>
    </div>
  );
}
