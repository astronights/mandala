"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDay, generateMandala, todayISO } from "@/lib/mandala";
import { ColouringBoard } from "@/components/ColouringBoard";
import { DrawBoard } from "@/components/DrawBoard";
import { ThemeToggle } from "@/components/ThemeToggle";
import controls from "@/components/controls.module.css";
import {
  loadPreferences,
  PLAY_MODES,
  savePreferences,
  type PlayMode,
} from "@/lib/storage/progress";
import styles from "./daily.module.css";

const MODE_LABEL: Record<PlayMode, string> = { guided: "Guided", free: "Free", draw: "Draw" };

/**
 * The user's only view: today's mandala. There is no way to browse other
 * days here; history lives on the admin page.
 */
export default function DailyClient() {
  const [today, setToday] = useState<string | null>(null);
  const [mode, setMode] = useState<PlayMode>("guided");

  const choose = (m: PlayMode) => {
    setMode(m);
    savePreferences({ mode: m });
  };

  // "Today" is the viewer's local date, so it can only be known on the client.
  // Re-check when the tab comes back, and every minute, so midnight brings
  // the new mandala even if the page stays open.
  useEffect(() => {
    const sync = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()));
    sync();
    // Preferences live in localStorage, which only exists on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(loadPreferences()?.mode ?? "guided");
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    const minute = setInterval(sync, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      clearInterval(minute);
    };
  }, []);

  const mandala = useMemo(() => (today ? generateMandala(today) : null), [today]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mandala</h1>
          {today && (
            <p className={styles.date} data-testid="today">
              {formatDay(today)}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <div className={`${controls.segmented} ${styles.modes}`} role="group" aria-label="Mode">
            {PLAY_MODES.map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => choose(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>
      {mandala && mode === "draw" ? (
        <DrawBoard key={mandala.date} mandala={mandala} />
      ) : mandala ? (
        <ColouringBoard
          key={`${mandala.date}:${mode}`}
          mandala={mandala}
          mode={mode === "free" ? "free" : "guided"}
          onSwitchMode={choose}
        />
      ) : (
        <div className={styles.placeholder} aria-hidden />
      )}
    </main>
  );
}
