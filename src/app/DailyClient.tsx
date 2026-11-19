"use client";

import { useEffect, useMemo, useState } from "react";
import { formatLong, generateMandala, todayISO } from "@/lib/mandala";
import { ColouringBoard } from "@/components/ColouringBoard";
import { ThemeToggle } from "@/components/ThemeToggle";
import controls from "@/components/controls.module.css";
import { loadPreferences, savePreferences, type ColourMode } from "@/lib/storage/progress";
import styles from "./daily.module.css";

/**
 * The user's only view: today's mandala. There is no way to browse other
 * days here; history lives on the admin page.
 */
export default function DailyClient() {
  const [today, setToday] = useState<string | null>(null);
  const [mode, setMode] = useState<ColourMode>("guided");

  // "Today" is the viewer's local date, so it can only be known on the client.
  // Re-check when the tab comes back, in case midnight passed meanwhile.
  useEffect(() => {
    const sync = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()));
    sync();
    // Preferences live in localStorage, which only exists on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(loadPreferences()?.mode ?? "guided");
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
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
              {formatLong(today)}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <div
            className={`${controls.segmented} ${styles.modes}`}
            role="group"
            aria-label="Colouring"
          >
            {(["guided", "free"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  savePreferences({ mode: m });
                }}
              >
                {m === "guided" ? "Guided" : "Free"}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>
      {mandala ? (
        <ColouringBoard key={`${mandala.date}:${mode}`} mandala={mandala} mode={mode} />
      ) : (
        <div className={styles.placeholder} aria-hidden />
      )}
    </main>
  );
}
