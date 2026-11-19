"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { ActivityReport, DayActivity } from "@/lib/admin/activity";
import { addDays, formatLong, mandalaNumber } from "@/lib/mandala";
import controls from "@/components/controls.module.css";
import styles from "./activity.module.css";

type Load =
  | { status: "loading"; data?: ActivityReport }
  | { status: "ready"; data: ActivityReport }
  | { status: "unconfigured" }
  | { status: "error"; data?: ActivityReport };

const RANGES = [7, 30, 90] as const;

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** Every date in the window, so days without plays show as zero. */
export function fillDays(report: ActivityReport, lastDay: string): DayActivity[] {
  const byDate = new Map(report.daily.map((d) => [d.date, d]));
  const out: DayActivity[] = [];
  for (let d = report.from; d <= lastDay; d = addDays(d, 1)) {
    out.push(
      byDate.get(d) ?? {
        date: d,
        version: null,
        symmetry: null,
        ringCount: null,
        pieceCount: null,
        paletteScheme: null,
        players: 0,
        finishers: 0,
        colourPlays: 0,
        drawPlays: 0,
        freePlays: 0,
        avgActiveSeconds: 0,
        avgProgress: 0,
      },
    );
  }
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * mag >= v) return step * mag;
  return 10 * mag;
}

const SERIES = [
  { key: "players", label: "Players", varName: "var(--series-1)" },
  { key: "finishers", label: "Finished", varName: "var(--series-2)" },
] as const;

function DailyChart({ days }: { days: DayActivity[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const m = { top: 12, right: 72, bottom: 28, left: 36 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const max = niceMax(Math.max(1, ...days.map((d) => d.players)));
  const x = (i: number) => m.left + (days.length <= 1 ? w / 2 : (i / (days.length - 1)) * w);
  const y = (v: number) => m.top + h - (v / max) * h;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(w / 70))));

  const path = (key: "players" | "finishers") =>
    days
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`)
      .join(" ");

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setHover(Math.round(rel * (days.length - 1)));
  };

  const last = days[days.length - 1];
  const hovered = hover !== null ? days[hover] : null;
  // Keep end labels apart when the two lines end close together.
  const endY = { players: y(last.players), finishers: y(last.finishers) };
  if (Math.abs(endY.players - endY.finishers) < 14) {
    endY.players = Math.min(endY.players, endY.finishers) - 7;
    endY.finishers = endY.players + 14;
  }

  return (
    <div ref={ref} className={styles.chart}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Players and finishers per day, ${days.length} days`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={m.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dy="0.32em">
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          // Every nth label, plus the last when it won't crowd its neighbour.
          i % labelEvery === 0 ||
          (i === days.length - 1 && (days.length - 1) % labelEvery >= labelEvery / 2) ? (
            <text
              key={d.date}
              x={x(i)}
              y={height - 8}
              className={styles.axisLabel}
              textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}
            >
              {shortDate(d.date)}
            </text>
          ) : null,
        )}
        {hovered && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={m.top}
            y2={m.top + h}
            className={styles.crosshair}
          />
        )}
        {SERIES.map((s) => (
          <path
            key={s.key}
            d={path(s.key)}
            fill="none"
            stroke={s.varName}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {SERIES.map((s) => (
          <text
            key={s.key}
            x={x(days.length - 1) + 8}
            y={endY[s.key]}
            dy="0.32em"
            className={styles.endLabel}
          >
            {s.label} {last[s.key]}
          </text>
        ))}
        {hovered &&
          SERIES.map((s) => (
            <circle
              key={s.key}
              cx={x(hover!)}
              cy={y(hovered[s.key])}
              r={4.5}
              fill={s.varName}
              className={styles.marker}
            />
          ))}
        <rect
          x={m.left}
          y={m.top}
          width={w}
          height={h}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hovered && (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(width - 160, Math.max(0, x(hover!) - 80)) }}
          role="status"
        >
          <strong>{formatLong(hovered.date)}</strong>
          {SERIES.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.varName }} /> {s.label} {hovered[s.key]}
            </span>
          ))}
          {hovered.symmetry && (
            <span className={styles.muted}>{hovered.symmetry}-fold pattern</span>
          )}
        </div>
      )}
    </div>
  );
}

function BarList({
  label,
  rows,
}: {
  label: string;
  rows: { key: string; name: string; value: number; display: string; detail?: string }[];
}) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <ul className={styles.bars} aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={styles.barRow} title={r.detail}>
          <span className={styles.barName}>{r.name}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.bar}
              style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className={styles.barValue}>{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      {note && <span className={styles.tileNote}>{note}</span>}
    </div>
  );
}

export function ActivityPanel({ today }: { today: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Keep showing the previous range while the next one loads: no skeleton flash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoad((prev) => ({ status: "loading", data: "data" in prev ? prev.data : undefined }));
    fetch(`/api/admin/activity?days=${days}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        setLoad(body.configured ? { status: "ready", data: body } : { status: "unconfigured" });
      })
      .catch(() => {
        if (!cancelled)
          setLoad((prev) => ({ status: "error", data: "data" in prev ? prev.data : undefined }));
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const data = "data" in load ? load.data : undefined;
  const filled = useMemo(() => (data ? fillDays(data, today) : []), [data, today]);

  if (load.status === "unconfigured") {
    return (
      <div className={styles.empty}>
        <p>No database is connected yet.</p>
        <p className={styles.muted}>
          Set <code>DATABASE_URL</code> (Neon) and run <code>npm run db:migrate</code> to start
          collecting anonymous activity.
        </p>
      </div>
    );
  }

  const todayRow = filled.find((d) => d.date === today);
  const totalPlays = data?.totals.plays ?? 0;

  return (
    <div className={`${styles.viz} ${load.status === "loading" && data ? styles.refreshing : ""}`}>
      <div className={styles.filters}>
        <div className={controls.segmented} role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </div>
        {load.status === "error" && (
          <span className={styles.muted} role="alert">
            Couldn’t refresh activity. Showing the last loaded data.
          </span>
        )}
      </div>

      {!data ? (
        <div className={styles.empty}>
          <p className={styles.muted}>
            {load.status === "error" ? "Couldn’t load activity." : "Loading…"}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tiles}>
            <Tile label="Players today" value={String(todayRow?.players ?? 0)} />
            <Tile
              label="Finished today"
              value={String(todayRow?.finishers ?? 0)}
              note={
                todayRow?.players
                  ? `${pct(todayRow.finishers / todayRow.players)} of players`
                  : undefined
              }
            />
            <Tile label="Active devices" value={String(data.totals.active7d)} note="last 7 days" />
            <Tile
              label="Average time today"
              value={formatDuration(todayRow?.avgActiveSeconds ?? 0)}
              note={
                todayRow?.players ? `${pct(todayRow.avgProgress)} coloured on average` : undefined
              }
            />
          </div>

          {totalPlays === 0 ? (
            <div className={styles.empty}>
              <p className={styles.muted}>No plays in this range yet.</p>
            </div>
          ) : (
            <>
              <section className={styles.card}>
                <header className={styles.cardHeader}>
                  <h3>Players per day</h3>
                  <span className={styles.legend}>
                    {SERIES.map((s) => (
                      <span key={s.key}>
                        <i style={{ background: s.varName }} /> {s.label}
                      </span>
                    ))}
                  </span>
                </header>
                <DailyChart days={filled} />
              </section>

              <div className={styles.pair}>
                <section className={styles.card}>
                  <header className={styles.cardHeader}>
                    <h3>Lines of symmetry used</h3>
                  </header>
                  <BarList
                    label="Plays by lines of symmetry"
                    rows={data.symmetryUsage.map((u) => ({
                      key: String(u.lines),
                      name: u.lines === 0 ? "off" : `${u.lines}`,
                      value: u.plays,
                      display: String(u.plays),
                    }))}
                  />
                </section>
                <section className={styles.card}>
                  <header className={styles.cardHeader}>
                    <h3>Finish rate by pattern</h3>
                  </header>
                  <BarList
                    label="Finish rate by pattern symmetry"
                    rows={data.byFold.map((f) => ({
                      key: String(f.symmetry),
                      name: `${f.symmetry}-fold`,
                      value: f.plays ? f.finishes / f.plays : 0,
                      display: pct(f.plays ? f.finishes / f.plays : 0),
                      detail: `${f.finishes} of ${f.plays} plays · ${formatDuration(f.avgActiveSeconds)} average`,
                    }))}
                  />
                </section>
              </div>

              <section className={styles.card}>
                <header className={styles.cardHeader}>
                  <h3>Days</h3>
                </header>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Pattern</th>
                        <th scope="col">Players</th>
                        <th scope="col">Finished</th>
                        <th scope="col">Avg time</th>
                        <th scope="col">Avg coloured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.map((d) => (
                        <tr key={d.date}>
                          <th scope="row">
                            {mandalaNumber(d.date) && (
                              <span className={styles.muted}>No. {mandalaNumber(d.date)} · </span>
                            )}
                            {formatLong(d.date)}
                          </th>
                          <td>
                            {d.symmetry ? `${d.symmetry}-fold · ${d.pieceCount} pieces` : "—"}
                          </td>
                          <td>{d.players}</td>
                          <td>{d.finishers}</td>
                          <td>{formatDuration(d.avgActiveSeconds)}</td>
                          <td>{pct(d.avgProgress)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
