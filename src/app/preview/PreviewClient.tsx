"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  DEFAULT_SEED,
  formatLong,
  generateMandala,
  todayISO,
  type Mandala,
} from "@/lib/mandala";
import { MandalaSvg, suggestedFills } from "@/components/MandalaSvg";
import styles from "./preview.module.css";

type View = "colour" | "line";
type Theme = "auto" | "light" | "dark";

const GRID_DAYS = 10;

function describe(m: Mandala): string {
  return m.rings
    .slice(1)
    .map((r) => r.motif + (r.perSegment > 1 ? "×2" : ""))
    .join(" · ");
}

export default function PreviewClient() {
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [view, setView] = useState<View>("colour");
  const [theme, setTheme] = useState<Theme>("auto");

  // Dates depend on the viewer's local clock, so resolve them on the client.
  useEffect(() => {
    const t = todayISO();
    setToday(t);
    setDate(t);
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);

  const seedKey = seed.trim() || DEFAULT_SEED;
  const hero = useMemo(() => (date ? generateMandala(date, seedKey) : null), [date, seedKey]);
  const grid = useMemo(() => {
    if (!date) return [];
    return Array.from({ length: GRID_DAYS }, (_, i) => generateMandala(addDays(date, i + 1), seedKey));
  }, [date, seedKey]);

  if (!date || !hero) return <main className={styles.page} />;

  const fillsFor = (m: Mandala) => (view === "colour" ? suggestedFills(m) : null);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mandala</h1>
          <p className={styles.subtitle}>Generator preview</p>
        </div>
        <div className={styles.segmented} role="group" aria-label="Theme">
          {(["auto", "light", "dark"] as Theme[]).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroArt}>
          <MandalaSvg mandala={hero} fills={fillsFor(hero)} className={styles.svg} />
        </div>

        <div className={styles.heroInfo}>
          <div className={styles.dateNav}>
            <button aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              ←
            </button>
            <div className={styles.dateLabel}>
              <span>{formatLong(date)}</span>
              {date !== today && (
                <button className={styles.link} onClick={() => today && setDate(today)}>
                  back to today
                </button>
              )}
            </div>
            <button aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
              →
            </button>
          </div>

          <div className={styles.segmented} role="group" aria-label="View">
            <button aria-pressed={view === "colour"} onClick={() => setView("colour")}>
              coloured
            </button>
            <button aria-pressed={view === "line"} onClick={() => setView("line")}>
              line art
            </button>
          </div>

          <dl className={styles.meta}>
            <dt>Symmetry</dt>
            <dd>{hero.symmetry}-fold</dd>
            <dt>Rings</dt>
            <dd>{describe(hero)}</dd>
            <dt>Colourable areas</dt>
            <dd>{hero.groups.length}</dd>
            <dt>Palette</dt>
            <dd>
              <span className={styles.swatches}>
                {hero.palette.colours.map((c, i) => (
                  <span key={i} className={styles.swatch} style={{ background: c.css }} title={c.css} />
                ))}
              </span>
              <span className={styles.scheme}>{hero.palette.scheme}</span>
            </dd>
          </dl>

          <label className={styles.seed}>
            <span>Seed</span>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button
            className={styles.link}
            onClick={() => setSeed(Math.random().toString(36).slice(2, 8))}
          >
            try a random seed
          </button>
        </div>
      </section>

      <h2 className={styles.sectionTitle}>The days ahead</h2>
      <section className={styles.grid}>
        {grid.map((m) => (
          <button key={m.date} className={styles.card} onClick={() => setDate(m.date)}>
            <MandalaSvg mandala={m} fills={fillsFor(m)} className={styles.svg} strokeWidth={2} />
            <span className={styles.cardDate}>{formatLong(m.date)}</span>
            <span className={styles.cardMeta}>{m.symmetry}-fold</span>
          </button>
        ))}
      </section>
    </main>
  );
}
