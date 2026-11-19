"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { IDENTITY, isZoomed, panBy, viewBoxFor, zoomAt, type View } from "@/lib/zoom";
import styles from "./ZoomPan.module.css";

/**
 * Pinch to zoom and drag to pan a square SVG, without getting in the way of
 * tapping pieces.
 *
 * - Two fingers pinch (and move) the view; trackpad pinch / ctrl+wheel zooms.
 * - One finger drags the view when zoomed in.
 * - A tap that didn't move still reaches the SVG as a normal click; any
 *   gesture swallows the click that would follow it.
 *
 * Zooming changes the SVG's viewBox directly, so the drawing stays sharp and
 * React doesn't re-render on every frame.
 */

const TAP_SLOP_PX = 8;

interface Props {
  children: ReactNode;
  /** Half-size of the drawing's coordinate space ([-r, r]²). */
  radius: number;
  /** Drag with one finger to pan when zoomed. Off in draw mode, where one finger draws. */
  oneFingerPan?: boolean;
}

export function ZoomPan({ children, radius, oneFingerPan = true }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<View>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    moved: false,
    startX: 0,
    startY: 0,
    lastDist: 0,
    lastMidX: 0,
    lastMidY: 0,
  });
  const [zoomed, setZoomed] = useState(false);

  const size = () => box.current?.clientWidth || 1;

  const apply = (next: View) => {
    view.current = next;
    const svg = box.current?.querySelector("svg[role=img]") ?? box.current?.querySelector("svg");
    svg?.setAttribute("viewBox", viewBoxFor(next, size(), radius));
    setZoomed(isZoomed(next));
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false;
      g.startX = p.x;
      g.startY = p.y;
    } else if (pointers.current.size === 2) {
      g.moved = true; // a pinch is never a tap
      const t = twoFinger();
      g.lastDist = t.dist;
      g.lastMidX = t.midX;
      g.lastMidY = t.midY;
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;

    if (pointers.current.size >= 2) {
      const t = twoFinger();
      let next = view.current;
      if (g.lastDist > 0) next = zoomAt(next, t.dist / g.lastDist, t.midX, t.midY, size());
      next = panBy(next, t.midX - g.lastMidX, t.midY - g.lastMidY, size());
      g.lastDist = t.dist;
      g.lastMidX = t.midX;
      g.lastMidY = t.midY;
      apply(next);
      return;
    }

    if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP_PX) g.moved = true;
    if (oneFingerPan && g.moved && isZoomed(view.current)) {
      apply(panBy(view.current, p.x - prev.x, p.y - prev.y, size()));
    }
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // Lifting one finger of a pinch: carry on as a pan without a jump.
      gesture.current.lastDist = 0;
    }
  };

  // A gesture must not also colour whatever it ended on.
  const onClickCapture = (e: MouseEvent) => {
    if (gesture.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      gesture.current.moved = false;
    }
  };

  // Trackpad pinch arrives as ctrl+wheel; it needs a non-passive listener.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !isZoomed(view.current)) return;
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey) apply(zoomAt(view.current, Math.exp(-e.deltaY * 0.01), p.x, p.y, size()));
      else apply(panBy(view.current, -e.deltaX, -e.deltaY, size()));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={box}
      className={styles.box}
      data-testid="zoom-pan"
      data-zoomed={zoomed || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onClickCapture={onClickCapture}
    >
      {children}
      {zoomed && (
        <button
          type="button"
          className={styles.reset}
          aria-label="Show the whole mandala"
          onClick={(e) => {
            e.stopPropagation();
            apply(IDENTITY);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      )}
    </div>
  );
}
