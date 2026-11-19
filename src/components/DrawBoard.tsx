"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from "react";
import {
  nearestSymmetry,
  symmetryOptions,
  SYMMETRY_OFF,
  VIEW_RADIUS,
  type Mandala,
} from "@/lib/mandala";
import {
  BRUSH_WIDTH,
  decodePoints,
  drawReducer,
  initialDraw,
  makeStroke,
  strokePath,
  symmetryTransforms,
  type Point,
  type Stroke,
} from "@/lib/draw";
import {
  clearDone,
  loadDone,
  loadDrawing,
  loadPreferences,
  saveDone,
  saveDrawing,
  savePreferences,
} from "@/lib/storage/progress";
import { PlayTracker } from "@/lib/activity/tracker";
import { FinishPanel } from "./FinishPanel";
import { MandalaSvg } from "./MandalaSvg";
import { SymmetryPicker } from "./SymmetryPicker";
import { ZoomPan } from "./ZoomPan";
import controls from "./controls.module.css";
import styles from "./ColouringBoard.module.css";

const FULL_SYMMETRY = 1000;
const MIN_SAMPLE_DISTANCE = 1.2; // view units between recorded points

export function drawHint(k: number, n: number): string {
  if (k === SYMMETRY_OFF) return "Just this stroke";
  if (k === n) return "Mirrored all round";
  return `${k} mirror line${k === 1 ? "" : "s"}`;
}

interface Props {
  mandala: Mandala;
  persist?: boolean;
  track?: boolean;
  /** Converts a pointer position to view coordinates; injectable for tests. */
  toView?: (svg: SVGSVGElement, clientX: number, clientY: number) => Point | null;
}

function screenToView(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

/** One stroke, shown in every symmetric copy. */
function StrokeCopies({ d, k, colour }: { d: string; k: number; colour: string }) {
  return (
    <g stroke={colour}>
      {symmetryTransforms(k).map((t, i) => (
        <path key={i} d={d} transform={t || undefined} />
      ))}
    </g>
  );
}

export function DrawBoard({
  mandala,
  persist = true,
  track = persist,
  toView = screenToView,
}: Props) {
  const n = mandala.symmetry;
  const palette = mandala.palette.colours;
  const options = useMemo(() => symmetryOptions(n), [n]);

  const [state, dispatch] = useReducer(drawReducer, undefined, () => initialDraw());
  const [colour, setColour] = useState(0);
  const [lines, setLines] = useState(n);
  const [current, setCurrent] = useState<Point[] | null>(null);
  const [loaded, setLoaded] = useState(!persist);
  const [done, setDone] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const pointers = useRef(new Set<number>());
  const drawing = useRef<{ id: number; points: Point[] } | null>(null);
  const tracker = useRef<PlayTracker | null>(null);

  useEffect(() => {
    if (!persist) return;
    dispatch({
      type: "load",
      strokes: loadDrawing(mandala.date).filter((s) => s.c < palette.length),
    });
    const prefs = loadPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(nearestSymmetry(n, prefs ? prefs.symmetry : FULL_SYMMETRY));
    setDone(!!loadDone(mandala.date, "draw"));
    setLoaded(true);
  }, [persist, mandala.date, n, palette.length]);

  useEffect(() => {
    if (persist && loaded) saveDrawing(mandala.date, state.strokes);
  }, [persist, loaded, mandala.date, state.strokes]);

  useEffect(() => {
    if (!track) return;
    const t = new PlayTracker({ date: mandala.date, version: mandala.version, mode: "draw" });
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

  const report = (completed = false) =>
    tracker.current?.interact({ progress: completed ? 1 : 0, symmetryLines: lines, completed });

  const svgOf = (e: PointerEvent<Element>) => (e.currentTarget as SVGElement).ownerSVGElement!;

  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    pointers.current.add(e.pointerId);
    if (done) return;
    if (pointers.current.size > 1) {
      // A second finger means pinch: drop the stroke in progress.
      drawing.current = null;
      setCurrent(null);
      return;
    }
    const p = toView(svgOf(e), e.clientX, e.clientY);
    if (!p) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drawing.current = { id: e.pointerId, points: [p] };
    setCurrent([p]);
  };

  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toView(svgOf(e), e.clientX, e.clientY);
    if (!p) return;
    const last = d.points[d.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_SAMPLE_DISTANCE) return;
    d.points.push(p);
    setCurrent([...d.points]);
  };

  const onPointerUp = (e: PointerEvent<SVGRectElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    drawing.current = null;
    setCurrent(null);
    dispatch({ type: "add", stroke: makeStroke(d.points, colour, lines) });
    report();
  };

  const onPointerCancel = (e: PointerEvent<SVGRectElement>) => {
    pointers.current.delete(e.pointerId);
    if (drawing.current?.id === e.pointerId) {
      drawing.current = null;
      setCurrent(null);
    }
  };

  const chooseLines = (k: number) => {
    setLines(k);
    if (persist) savePreferences({ symmetry: k === n ? FULL_SYMMETRY : k });
  };

  const finish = () => {
    report(true);
    if (persist) saveDone(mandala.date, "draw");
    setDone(true);
    setJustFinished(true);
  };

  const keepDrawing = () => {
    clearDone(mandala.date, "draw");
    setDone(false);
    setJustFinished(false);
  };

  const paths = useMemo(
    () => state.strokes.map((s: Stroke) => ({ d: strokePath(decodePoints(s.p)), s })),
    [state.strokes],
  );

  return (
    <div className={styles.board}>
      <div className={`${styles.art} ${justFinished ? styles.bloom : ""}`}>
        <ZoomPan radius={VIEW_RADIUS} oneFingerPan={false}>
          <MandalaSvg
            mandala={mandala}
            className={styles.svg}
            strokeWidth={1}
            nonScalingStroke
            faint
            title="Today's mandala. Draw with one finger, pinch to zoom."
          >
            <g
              fill="none"
              strokeWidth={BRUSH_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              data-testid="strokes"
            >
              {paths.map(({ d, s }, i) => (
                <StrokeCopies key={i} d={d} k={s.k} colour={palette[s.c].css} />
              ))}
              {current && (
                <StrokeCopies d={strokePath(current)} k={lines} colour={palette[colour].css} />
              )}
            </g>
            {!done && (
              <rect
                x={-VIEW_RADIUS}
                y={-VIEW_RADIUS}
                width={2 * VIEW_RADIUS}
                height={2 * VIEW_RADIUS}
                fill="transparent"
                data-testid="draw-surface"
                style={{ cursor: "crosshair" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              />
            )}
          </MandalaSvg>
        </ZoomPan>
      </div>

      <div className={styles.dock}>
        {done ? (
          <FinishPanel
            title="Today’s drawing is complete"
            actionLabel="Keep drawing"
            onAction={keepDrawing}
          />
        ) : (
          <>
            <div className={styles.palette} role="radiogroup" aria-label="Colour">
              {palette.map((c, i) => (
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
            </div>

            <SymmetryPicker
              options={options}
              value={lines}
              max={n}
              onChange={chooseLines}
              hint={drawHint}
            />

            <div className={styles.actions}>
              <button
                type="button"
                className={controls.textButton}
                disabled={state.past.length === 0}
                onClick={() => dispatch({ type: "undo" })}
              >
                Undo
              </button>
              <button
                type="button"
                className={controls.textButton}
                disabled={state.strokes.length === 0}
                onClick={() => dispatch({ type: "clear" })}
              >
                Clear
              </button>
              <span className={styles.progress} data-testid="stroke-count">
                {state.strokes.length} stroke{state.strokes.length === 1 ? "" : "s"}
              </span>
              {state.strokes.length > 0 && (
                <button type="button" className={styles.doneButton} onClick={finish}>
                  I’m done
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
