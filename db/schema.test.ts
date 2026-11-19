import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { loadMigrations, migrate } from "./migrator.ts";
import { memoryDb } from "./testing.ts";

const DEVICE_A = "00000000-0000-4000-8000-00000000000a";
const DEVICE_B = "00000000-0000-4000-8000-00000000000b";

let db: Awaited<ReturnType<typeof memoryDb>>;

beforeAll(async () => {
  db = await memoryDb();
  await migrate(db, await loadMigrations(path.join(import.meta.dirname, "migrations")));
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("delete from plays; delete from devices;");
  await db.query("insert into devices (id) values ($1), ($2)", [DEVICE_A, DEVICE_B]);
});

interface Play {
  device: string;
  date?: string;
  mode?: string;
  seconds?: number;
  progress?: number;
  lines?: number | null;
  done?: boolean;
}

const play = ({
  device,
  date = "2026-11-18",
  mode = "colour",
  seconds = 60,
  progress = 0.5,
  lines = 12,
  done = false,
}: Play) =>
  db.query(
    `insert into plays (device_id, play_date, mode, mandala_version, active_seconds, progress,
                        symmetry_lines, completed_at)
     values ($1, $2, $3, 1, $4, $5, $6, case when $7 then now() end)`,
    [device, date, mode, seconds, progress, lines, done],
  );

describe("schema: constraints", () => {
  it("accepts guided, free and draw plays", async () => {
    for (const mode of ["colour", "free", "draw"]) {
      await expect(play({ device: DEVICE_A, mode })).resolves.toBeDefined();
    }
  });

  it.each<[string, Partial<Play>]>([
    ["an unknown mode", { mode: "paint" }],
    ["negative time", { seconds: -1 }],
    ["more than a day of time", { seconds: 86401 }],
    ["progress above 1", { progress: 1.2 }],
    ["negative progress", { progress: -0.1 }],
    ["too many symmetry lines", { lines: 65 }],
  ])("rejects %s", async (_, overrides) => {
    await expect(play({ device: DEVICE_A, ...overrides })).rejects.toThrow(/violates check/);
  });

  it("rejects plays for unknown devices", async () => {
    await expect(play({ device: "00000000-0000-4000-8000-0000000000ff" })).rejects.toThrow(
      /foreign key/,
    );
  });

  it("keeps one row per device, day and mode, so the app can upsert", async () => {
    await play({ device: DEVICE_A });
    await expect(play({ device: DEVICE_A })).rejects.toThrow(/duplicate key/);
    await expect(play({ device: DEVICE_A, mode: "draw" })).resolves.toBeDefined();
    await db.query(
      `insert into plays (device_id, play_date, mode, mandala_version, progress)
       values ($1, '2026-11-18', 'colour', 1, 0.9)
       on conflict (device_id, play_date, mode)
       do update set progress = excluded.progress, updated_at = now()`,
      [DEVICE_A],
    );
    const { rows } = await db.query<{ progress: number }>(
      "select progress from plays where device_id = $1 and mode = 'colour'",
      [DEVICE_A],
    );
    expect(rows[0].progress).toBeCloseTo(0.9);
  });

  it("rejects timestamps that run backwards", async () => {
    await expect(
      db.query(
        `insert into plays (device_id, play_date, mode, mandala_version, started_at, completed_at)
         values ($1, '2026-11-18', 'colour', 1, now(), now() - interval '1 hour')`,
        [DEVICE_A],
      ),
    ).rejects.toThrow(/plays_completed_after_started/);
    await expect(
      db.query("update devices set last_seen_at = created_at - interval '1 day' where id = $1", [
        DEVICE_A,
      ]),
    ).rejects.toThrow(/devices_seen_after_created/);
  });

  it("deletes a device's plays along with it", async () => {
    await play({ device: DEVICE_A });
    await db.query("delete from devices where id = $1", [DEVICE_A]);
    expect((await db.query("select * from plays")).rows).toHaveLength(0);
  });
});

describe("schema: activity views", () => {
  it("summarises each day", async () => {
    await play({ device: DEVICE_A, seconds: 100, progress: 1, done: true });
    await play({ device: DEVICE_A, mode: "draw", seconds: 50, progress: 0.2 });
    await play({ device: DEVICE_B, seconds: 30, progress: 0.3 });
    await play({ device: DEVICE_B, date: "2026-11-19", seconds: 10, progress: 0.1 });

    const { rows } = await db.query("select * from daily_activity order by play_date");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      players: 2,
      finishers: 1,
      colour_plays: 2,
      draw_plays: 1,
      free_plays: 0,
      avg_active_seconds: 60,
    });
    expect(Number(rows[0].avg_progress)).toBeCloseTo(0.5, 3);
    expect(rows[1]).toMatchObject({ players: 1, finishers: 0 });
  });

  it("counts symmetry settings and skips plays without one", async () => {
    await play({ device: DEVICE_A, lines: 0 });
    await play({ device: DEVICE_B, lines: 0 });
    await play({ device: DEVICE_A, mode: "draw", lines: null });
    const { rows } = await db.query("select symmetry_lines, plays from symmetry_usage");
    expect(rows).toEqual([{ symmetry_lines: 0, plays: 2 }]);
  });
});

describe("schema: daily_mandalas", () => {
  const insert = (over: Record<string, unknown> = {}) => {
    const row = {
      play_date: "2026-11-18",
      mandala_version: 1,
      seed: "mandala",
      symmetry: 12,
      ring_count: 2,
      motifs: ["centre", "petal"],
      piece_count: 100,
      group_count: 10,
      palette_scheme: "analogous",
      palette: ["oklch(0.8 0.05 10)"],
      override_seed: null,
      override_note: null,
      ...over,
    };
    const cols = Object.keys(row);
    const values = cols.map((_, i) => `$${i + 1}`).join(", ");
    return db.query(
      `insert into daily_mandalas (${cols.join(", ")}) values (${values})`,
      Object.values(row),
    );
  };

  beforeEach(() => db.exec("truncate daily_mandalas"));

  it("stores one row per date, with an optional override", async () => {
    await insert({ override_seed: "lotus", override_note: "Festival day" });
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });

  it.each<[string, Record<string, unknown>]>([
    ["motifs that don't match the ring count", { motifs: ["centre"] }],
    ["an empty seed", { seed: "" }],
    ["an overlong override seed", { override_seed: "x".repeat(65) }],
    ["an overlong note", { override_note: "x".repeat(501) }],
    ["an implausible symmetry", { symmetry: 2 }],
    ["an empty palette", { palette: [] }],
  ])("rejects %s", async (_, over) => {
    await expect(insert(over)).rejects.toThrow(/violates check/);
  });

  it("joins each day's pattern to its activity in daily_overview", async () => {
    await insert();
    await play({ device: DEVICE_A, done: true });
    await play({ device: DEVICE_B, date: "2026-11-19" });
    const { rows } = await db.query(
      "select play_date::text as d, symmetry, players, finishers from daily_overview order by 1",
    );
    expect(rows).toEqual([
      { d: "2026-11-18", symmetry: 12, players: 1, finishers: 1 },
      { d: "2026-11-19", symmetry: null, players: 1, finishers: 0 },
    ]);
  });
});
