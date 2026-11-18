import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migratedAppDb } from "../../../db/testing.ts";
import {
  dbFailureStore,
  lockedUntil,
  MAX_FAILURES,
  memoryFailureStore,
  WINDOW_MINUTES,
  type FailureStore,
} from "./lockout";

let t: Awaited<ReturnType<typeof migratedAppDb>>;
beforeAll(async () => {
  t = await migratedAppDb();
});
afterAll(() => t.close());
beforeEach(() => t.pg.exec("delete from admin_login_failures"));

const T0 = new Date("2026-11-18T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe.each<[string, () => FailureStore]>([
  ["memory", () => memoryFailureStore()],
  ["database", () => dbFailureStore(t.db)],
])("lockout (%s store)", (_, make) => {
  it(`locks after ${MAX_FAILURES} failures and reopens when they age out`, async () => {
    const store = make();
    for (let i = 0; i < MAX_FAILURES - 1; i++) await store.recordFailure(at(i));
    expect(await lockedUntil(store, at(4))).toBeNull();
    await store.recordFailure(at(4));
    expect(await lockedUntil(store, at(4))).toEqual(at(WINDOW_MINUTES));
    expect(await lockedUntil(store, at(WINDOW_MINUTES - 1))).not.toBeNull();
    expect(await lockedUntil(store, at(WINDOW_MINUTES + 0.5))).toBeNull();
  });

  it("forgets failures after a successful sign-in", async () => {
    const store = make();
    for (let i = 0; i < MAX_FAILURES; i++) await store.recordFailure(at(0));
    await store.clear();
    expect(await lockedUntil(store, at(1))).toBeNull();
  });
});

it("prunes day-old failures from the database", async () => {
  const store = dbFailureStore(t.db);
  await store.recordFailure(new Date(T0.getTime() - 2 * 86_400_000));
  await store.recordFailure(T0);
  expect(await t.db.query("select 1 from admin_login_failures")).toHaveLength(1);
});
