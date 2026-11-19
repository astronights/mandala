"use client";

import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextDay } from "@/lib/day";
import styles from "./FinishPanel.module.css";

interface Props {
  title: string;
  /** e.g. "Keep colouring", "Colour it freely" */
  actionLabel?: string;
  onAction?: () => void;
  now?: () => Date;
}

/** Shown in place of the controls once today's mandala is finished. */
export function FinishPanel({ title, actionLabel, onAction, now = () => new Date() }: Props) {
  const [ms, setMs] = useState(() => msUntilNextDay(now()));

  useEffect(() => {
    const tick = () => setMs(msUntilNextDay(now()));
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [now]);

  return (
    <section className={styles.panel} aria-live="polite" data-testid="finish-panel">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.next}>
        A new mandala in <span data-testid="countdown">{formatCountdown(ms)}</span>
      </p>
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </section>
  );
}
