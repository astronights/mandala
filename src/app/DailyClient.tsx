"use client";

import { useEffect, useMemo, useState } from "react";
import { formatLong, generateMandala, todayISO } from "@/lib/mandala";
import { ColouringBoard } from "@/components/ColouringBoard";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./daily.module.css";

/**
 * The user's only view: today's mandala. There is no way to browse other
 * days here; history lives on the admin page.
 */
export default function DailyClient() {
  const [today, setToday] = useState<string | null>(null);

  // "Today" is the viewer's local date, so it can only be known on the client.
  // Re-check when the tab comes back, in case midnight passed meanwhile.
  useEffect(() => {
    const sync = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()));
    sync();
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
        <ThemeToggle />
      </header>
      {mandala ? (
        <ColouringBoard key={mandala.date} mandala={mandala} />
      ) : (
        <div className={styles.placeholder} aria-hidden />
      )}
    </main>
  );
}
