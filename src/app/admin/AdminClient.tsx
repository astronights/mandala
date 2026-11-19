"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  DEFAULT_SEED,
  formatLong,
  FIRST_DAY,
  generateMandala,
  mandalaNumber,
  todayISO,
  type Mandala,
} from "@/lib/mandala";
import { MandalaSvg, suggestedFills } from "@/components/MandalaSvg";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ActivityPanel } from "./ActivityPanel";
import controls from "@/components/controls.module.css";
import styles from "./admin.module.css";

type View = "colour" | "line";
type Tab = "activity" | "patterns";

/** History shows the most recent live days, from No. 1 onwards. */
const HISTORY_DAYS = 30;
const UPCOMING_DAYS = 10;

/** Live days from No. 1 up to today, newest first (at most `limit`). */
export function historyDates(today: string, limit = HISTORY_DAYS): string[] {
  const out: string[] = [];
  for (let d = today; d >= FIRST_DAY && out.length < limit; d = addDays(d, -1)) out.push(d);
  return out;
}

function describeRings(m: Mandala): string {
  return m.rings
    .slice(1)
    .map((r) => r.motif + (r.perSegment > 1 ? "×2" : ""))
    .join(" · ");
}

function DayGrid({
  dates,
  seed,
  view,
  onPick,
}: {
  dates: string[];
  seed: string;
  view: View;
  onPick: (d: string) => void;
}) {
  const items = useMemo(() => dates.map((d) => generateMandala(d, seed)), [dates, seed]);
  return (
    <div className={styles.grid}>
      {items.map((m) => (
        <button key={m.date} type="button" className={styles.card} onClick={() => onPick(m.date)}>
          <MandalaSvg
            mandala={m}
            fills={view === "colour" ? suggestedFills(m) : null}
            className={styles.svg}
            strokeWidth={2}
          />
          <span className={styles.cardDate}>{formatLong(m.date)}</span>
          <span className={styles.cardMeta}>
            {mandalaNumber(m.date) ? `No. ${mandalaNumber(m.date)} · ` : ""}
            {m.symmetry}-fold
          </span>
        </button>
      ))}
    </div>
  );
}

export default function AdminClient() {
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [view, setView] = useState<View>("colour");
  const [tab, setTab] = useState<Tab>("activity");

  // Dates depend on the viewer's local clock, so resolve them on the client.
  useEffect(() => {
    const t = todayISO();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(t);
    setDate(t);
  }, []);

  const seedKey = seed.trim() || DEFAULT_SEED;
  const hero = useMemo(() => (date ? generateMandala(date, seedKey) : null), [date, seedKey]);
  const history = useMemo(() => (today ? historyDates(today) : []), [today]);
  const upcoming = useMemo(
    () => (today ? Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(today, i + 1)) : []),
    [today],
  );

  if (!date || !hero || !today) return <main className={styles.page} />;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mandala</h1>
          <p className={styles.subtitle}>Admin</p>
        </div>
        <div className={styles.headerActions}>
          <ThemeToggle />
        </div>
      </header>

      <nav className={`${controls.segmented} ${styles.tabs}`} aria-label="Admin sections">
        <button type="button" aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>
          Activity
        </button>
        <button type="button" aria-pressed={tab === "patterns"} onClick={() => setTab("patterns")}>
          Patterns
        </button>
      </nav>

      {tab === "activity" ? (
        <ActivityPanel today={today} />
      ) : (
        <>
          <section className={styles.hero}>
            <div className={styles.heroArt}>
              <MandalaSvg
                mandala={hero}
                fills={view === "colour" ? suggestedFills(hero) : null}
                className={styles.svg}
              />
            </div>

            <div className={styles.heroInfo}>
              <div className={styles.dateNav}>
                <button
                  type="button"
                  aria-label="Previous day"
                  disabled={date <= FIRST_DAY}
                  onClick={() => setDate(addDays(date, -1))}
                >
                  ←
                </button>
                <div className={styles.dateLabel}>
                  <span data-testid="admin-date">{formatLong(date)}</span>
                  {mandalaNumber(date) && (
                    <span className={styles.badge}>Mandala No. {mandalaNumber(date)}</span>
                  )}
                  {date === today ? (
                    <span className={styles.badge}>live today</span>
                  ) : (
                    <button type="button" className={styles.link} onClick={() => setDate(today)}>
                      back to today
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Next day"
                  onClick={() => setDate(addDays(date, 1))}
                >
                  →
                </button>
              </div>

              <div className={controls.segmented} role="group" aria-label="View">
                <button
                  type="button"
                  aria-pressed={view === "colour"}
                  onClick={() => setView("colour")}
                >
                  coloured
                </button>
                <button
                  type="button"
                  aria-pressed={view === "line"}
                  onClick={() => setView("line")}
                >
                  line art
                </button>
              </div>

              <dl className={styles.meta}>
                <dt>Symmetry</dt>
                <dd>{hero.symmetry}-fold</dd>
                <dt>Rings</dt>
                <dd>{describeRings(hero)}</dd>
                <dt>Pieces</dt>
                <dd>
                  {hero.regions.length} pieces · {hero.groups.length} colour groups
                </dd>
                <dt>Palette</dt>
                <dd>
                  <span className={styles.swatches}>
                    {hero.palette.colours.map((c, i) => (
                      <span
                        key={i}
                        className={styles.swatch}
                        style={{ background: c.css }}
                        title={c.css}
                      />
                    ))}
                  </span>
                  <span className={styles.muted}>{hero.palette.scheme}</span>
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
              <p className={styles.note}>
                Players always get seed “{DEFAULT_SEED}”. Other seeds are for exploring only.
              </p>
            </div>
          </section>

          <h2 className={styles.sectionTitle}>History</h2>
          {history.length ? (
            <DayGrid dates={history} seed={seedKey} view={view} onPick={setDate} />
          ) : (
            <p className={styles.muted}>History starts with Mandala No. 1.</p>
          )}

          <h2 className={styles.sectionTitle}>Coming up</h2>
          <p className={styles.sectionNote}>
            A preview, generated on the fly. Nothing is saved until a day goes live.
          </p>
          <DayGrid dates={upcoming} seed={seedKey} view={view} onPick={setDate} />
        </>
      )}
    </main>
  );
}
