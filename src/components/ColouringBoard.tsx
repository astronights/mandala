"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  nearestSymmetry,
  SymmetryIndex,
  symmetryAxes,
  symmetryOptions,
  SYMMETRY_OFF,
  VIEW_RADIUS,
  type Mandala,
} from "@/lib/mandala";
import { colouringReducer, initialColouring, progress, type Fills } from "@/lib/colouring";
import {
  guidedProgress,
  guidedTap,
  hintFill,
  nextColour,
  remainingByColour,
  targetColours,
} from "@/lib/guided";
import {
  clearDone,
  loadDone,
  loadPreferences,
  loadProgress,
  saveDone,
  savePreferences,
  saveProgress,
  type ColourMode,
  type PlayMode,
} from "@/lib/storage/progress";
import { FinishPanel } from "./FinishPanel";
import { SymmetryPicker } from "./SymmetryPicker";
import { PlayTracker } from "@/lib/activity/tracker";
import { MandalaSvg } from "./MandalaSvg";
import { ZoomPan } from "./ZoomPan";
import controls from "./controls.module.css";
import styles from "./ColouringBoard.module.css";

const FULL_SYMMETRY = 1000; // stored preference meaning "as many lines as the day allows"
const GUIDE_MS = 1800;
const NUDGE_MS = 1200;
/** Pause between rings when the rest of a guided mandala is revealed. */
const REVEAL_STEP_MS = 160;

interface Props {
  mandala: Mandala;
  /** Guided: the day's colours, piece by piece. Free: any colour anywhere. */
  mode?: ColourMode;
  /** Disable persistence (tests, admin previews). */
  persist?: boolean;
  /** Report anonymous activity (defaults to `persist`). */
  track?: boolean;
  /** Offered after finishing guided colouring ("Colour it freely"). */
  onSwitchMode?: (mode: PlayMode) => void;
  /** Reveal speed; tests pass 0. */
  revealStepMs?: number;
}

export { symmetryHint } from "./SymmetryPicker";

export function ColouringBoard({
  mandala,
  mode = "guided",
  persist = true,
  track = persist,
  onSwitchMode,
  revealStepMs = REVEAL_STEP_MS,
}: Props) {
  const guided = mode === "guided";
  const n = mandala.symmetry;
  const paletteSize = mandala.palette.colours.length;
  const options = useMemo(() => symmetryOptions(n), [n]);
  const index = useMemo(() => new SymmetryIndex(mandala), [mandala]);
  const targets = useMemo(() => targetColours(mandala), [mandala]);

  const [state, dispatch] = useReducer(colouringReducer, undefined, () => initialColouring());
  const [picked, setPicked] = useState<number | null>(0);
  const [lines, setLines] = useState(n);
  const [guidesVisible, setGuidesVisible] = useState(false);
  const [nudge, setNudge] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(!persist);
  const [done, setDone] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracker = useRef<PlayTracker | null>(null);
  // Bumped by user actions only, so loading saved work isn't reported as play.
  const [interactions, setInteractions] = useState(0);
  const interacted = () => setInteractions((c) => c + 1);

  const remaining = useMemo(
    () => remainingByColour(targets, state.fills, paletteSize),
    [targets, state.fills, paletteSize],
  );
  // In guided mode, a finished colour hands over to the next one by itself.
  const colour = guided ? nextColour(remaining, picked) : picked;
  const share = guided
    ? guidedProgress(targets, state.fills)
    : progress(state.fills, mandala.regions.length);

  useEffect(() => {
    if (!track) return;
    const t = new PlayTracker({
      date: mandala.date,
      version: mandala.version,
      mode: guided ? "colour" : "free",
    });
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
  }, [track, mandala.date, mandala.version, guided]);

  // Restore saved work and preferences for this day and mode.
  useEffect(() => {
    if (!persist) return;
    const saved = loadProgress(mandala.date, mode);
    const fills: Record<number, number> = {};
    for (const [k, v] of Object.entries(saved?.fills ?? {})) {
      const i = Number(k);
      if (i >= mandala.regions.length || v >= paletteSize) continue;
      // Guided canvases only ever hold each piece's intended colour.
      if (guided && targets[i] !== v) continue;
      fills[i] = v;
    }
    dispatch({ type: "load", fills });
    const prefs = loadPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(nearestSymmetry(n, prefs ? prefs.symmetry : FULL_SYMMETRY));
    setDone(!!loadDone(mandala.date, mode));
    setLoaded(true);
  }, [persist, mandala, n, mode, guided, targets, paletteSize]);

  useEffect(() => {
    if (persist && loaded) saveProgress(mandala.date, state.fills as Record<number, number>, mode);
  }, [persist, loaded, mandala.date, state.fills, mode]);

  useEffect(() => {
    if (interactions === 0) return;
    tracker.current?.interact({ progress: share, symmetryLines: lines });
    // Only user actions should report; progress and lines are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactions]);

  useEffect(
    () => () => {
      if (guideTimer.current) clearTimeout(guideTimer.current);
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      revealTimers.current.forEach(clearTimeout);
    },
    [],
  );

  /** Ring of each piece, centre = 0, for the outward reveal. */
  const ringOf = useMemo(() => {
    const byGroup = new Map(mandala.groups.map((g) => [g.id, g.ring]));
    return mandala.regions.map((r) => byGroup.get(r.group) ?? 0);
  }, [mandala]);

  const finish = () => {
    if (done) return;
    // Report what was actually coloured, before any reveal.
    tracker.current?.interact({ progress: share, symmetryLines: lines, completed: true });
    if (persist) saveDone(mandala.date, mode);
    setDone(true);
    setJustFinished(true);
    if (!guided || share >= 1) return;

    // Guided: let the rest of the day's design bloom outward, ring by ring.
    const base = { ...(state.fills as Record<number, number>) };
    const maxRing = Math.max(...ringOf);
    for (let ring = 0; ring <= maxRing; ring++) {
      revealTimers.current.push(
        setTimeout(() => {
          const fills = { ...base };
          ringOf.forEach((r, i) => {
            if (r <= ring) fills[i] = targets[i];
          });
          dispatch({ type: "load", fills });
        }, ring * revealStepMs),
      );
    }
  };

  const keepColouring = () => {
    clearDone(mandala.date, mode);
    setDone(false);
    setJustFinished(false);
  };

  // Colouring every piece finishes the day by itself.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loaded && !done && interactions > 0 && share >= 1) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, loaded, done, interactions]);

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
      if (done) return;
      const orbit = index.orbit(i, lines);
      if (!guided) {
        dispatch({ type: "paint", indices: orbit, colour });
        setInteractions((c) => c + 1);
        return;
      }
      if (colour === null) return;
      const tap = guidedTap(i, orbit, targets, colour, state.fills);
      if (tap.kind === "fill") {
        dispatch({ type: "paint", indices: tap.indices, colour });
        setInteractions((c) => c + 1);
      } else if (tap.kind === "wrong") {
        // Gently point at the colour this piece wants.
        setNudge(tap.wants);
        if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        nudgeTimer.current = setTimeout(() => setNudge(null), NUDGE_MS);
      }
    },
    [index, lines, colour, guided, targets, state.fills, done],
  );

  const regionFills = useMemo(() => {
    const out: Record<number, string> = {};
    const css = mandala.palette.colours;
    if (guided && colour !== null) {
      const tint = hintFill(css[colour].css);
      targets.forEach((t, i) => {
        if (t === colour) out[i] = tint;
      });
    }
    for (const [k, v] of Object.entries(state.fills as Fills)) out[Number(k)] = css[v]?.css;
    return out;
  }, [state.fills, mandala.palette.colours, guided, colour, targets]);

  const pct = Math.round(share * 100);

  return (
    <div className={styles.board}>
      <div className={`${styles.art} ${justFinished ? styles.bloom : ""}`}>
        <ZoomPan radius={VIEW_RADIUS}>
          <MandalaSvg
            mandala={mandala}
            regionFills={regionFills}
            onRegionTap={onRegionTap}
            guides={symmetryAxes(lines)}
            guidesVisible={guidesVisible}
            className={styles.svg}
            strokeWidth={1}
            nonScalingStroke
            title="Today's mandala. Tap a piece to colour it, pinch to zoom."
          />
        </ZoomPan>
      </div>

      {done ? (
        <div className={styles.dock}>
          <FinishPanel
            title="Today’s mandala is complete"
            actionLabel={
              guided ? (onSwitchMode ? "Colour it freely" : undefined) : "Keep colouring"
            }
            onAction={guided ? () => onSwitchMode?.("free") : keepColouring}
          />
        </div>
      ) : (
        <div className={styles.dock}>
          <div className={styles.palette} role="radiogroup" aria-label="Colour">
            {mandala.palette.colours.map((c, i) => {
              const done = guided && remaining[i] === 0;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={colour === i}
                  aria-label={`Colour ${i + 1}${done ? ", done" : ""}`}
                  aria-disabled={done || undefined}
                  className={`${styles.swatch} ${done ? styles.done : ""} ${nudge === i ? styles.nudge : ""}`}
                  style={{ background: c.css }}
                  onClick={() => !done && setPicked(i)}
                >
                  {done && (
                    <svg viewBox="0 0 24 24" aria-hidden className={styles.tick}>
                      <path d="M6 12.5l4 4 8-9" />
                    </svg>
                  )}
                </button>
              );
            })}
            {!guided && (
              <button
                type="button"
                role="radio"
                aria-checked={colour === null}
                aria-label="Eraser"
                className={`${styles.swatch} ${styles.eraser}`}
                onClick={() => setPicked(null)}
              />
            )}
          </div>
          <p className={styles.nudgeText} aria-live="polite">
            {nudge !== null ? `That piece wants colour ${nudge + 1}` : ""}
          </p>

          <SymmetryPicker options={options} value={lines} max={n} onChange={chooseLines} />

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
              disabled={Object.keys(state.fills).length === 0}
              onClick={() => {
                dispatch({ type: "clear" });
                interacted();
              }}
            >
              Clear
            </button>
            <span className={styles.progress} data-testid="progress">
              {pct}%
            </span>
            {Object.keys(state.fills).length > 0 && (
              <button type="button" className={styles.doneButton} onClick={finish}>
                I’m done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
