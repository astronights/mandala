// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadDone,
  saveDone,
  isDayProgress,
  loadPreferences,
  loadProgress,
  PREFS_KEY,
  progressKey,
  savePreferences,
  saveProgress,
  STORAGE_VERSION,
} from "./progress";

afterEach(() => vi.restoreAllMocks());

describe("day progress", () => {
  it("round-trips today's fills", () => {
    expect(saveProgress("2026-11-18", { 3: 1, 10: 0 })).toBe(true);
    const p = loadProgress("2026-11-18");
    expect(p?.fills).toEqual({ 3: 1, 10: 0 });
    expect(p?.v).toBe(STORAGE_VERSION);
  });

  it("keeps days separate", () => {
    saveProgress("2026-11-18", { 1: 1 });
    expect(loadProgress("2026-11-19")).toBeNull();
  });

  it("ignores corrupt, foreign or mismatched data", () => {
    localStorage.setItem(progressKey("2026-11-18"), "{not json");
    expect(loadProgress("2026-11-18")).toBeNull();
    localStorage.setItem(
      progressKey("2026-11-18"),
      JSON.stringify({ v: 99, date: "2026-11-18", fills: {} }),
    );
    expect(loadProgress("2026-11-18")).toBeNull();
    localStorage.setItem(
      progressKey("2026-11-18"),
      JSON.stringify({ v: STORAGE_VERSION, date: "2026-11-17", fills: {} }),
    );
    expect(loadProgress("2026-11-18")).toBeNull();
  });

  it.each([
    [{ v: STORAGE_VERSION, date: "d", fills: { a: 1 } }, false],
    [{ v: STORAGE_VERSION, date: "d", fills: { 1: -1 } }, false],
    [{ v: STORAGE_VERSION, date: "d", fills: { 1: 1.5 } }, false],
    [{ v: STORAGE_VERSION, date: "d", fills: [] }, false],
    [{ v: STORAGE_VERSION, date: "d", fills: { 1: 2 } }, true],
    [null, false],
  ])("validates %j → %s", (value, ok) => {
    expect(isDayProgress(value)).toBe(ok);
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(saveProgress("2026-11-18", { 1: 1 })).toBe(false);
    expect(loadProgress("2026-11-18")).toBeNull();
    expect(savePreferences({ symmetry: 4 })).toBe(false);
    expect(loadPreferences()).toBeNull();
  });
});

describe("preferences", () => {
  it("round-trips the symmetry choice", () => {
    expect(loadPreferences()).toBeNull();
    savePreferences({ symmetry: 4 });
    expect(loadPreferences()).toEqual({ v: STORAGE_VERSION, symmetry: 4 });
  });

  it("rejects invalid preferences", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: STORAGE_VERSION, symmetry: "lots" }));
    expect(loadPreferences()).toBeNull();
  });
});

describe("modes and merged preferences", () => {
  it("keeps guided and free canvases apart", () => {
    saveProgress("2026-11-18", { 1: 1 }, "guided");
    saveProgress("2026-11-18", { 2: 3 }, "free");
    expect(loadProgress("2026-11-18")?.fills).toEqual({ 1: 1 });
    expect(loadProgress("2026-11-18", "free")?.fills).toEqual({ 2: 3 });
    expect(progressKey("2026-11-18", "free")).not.toBe(progressKey("2026-11-18"));
  });

  it("saving one preference keeps the others", () => {
    savePreferences({ symmetry: 4 });
    savePreferences({ mode: "free" });
    expect(loadPreferences()).toEqual({ v: STORAGE_VERSION, symmetry: 4, mode: "free" });
  });

  it("rejects an unknown mode", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: STORAGE_VERSION, symmetry: 2, mode: "x" }));
    expect(loadPreferences()).toBeNull();
  });
});

describe("finished days", () => {
  it("remembers 'I'm done' per day and mode", () => {
    expect(loadDone("2026-11-19", "guided")).toBeNull();
    saveDone("2026-11-19", "guided", 123);
    expect(loadDone("2026-11-19", "guided")).toEqual({
      v: STORAGE_VERSION,
      date: "2026-11-19",
      mode: "guided",
      finishedAt: 123,
    });
    expect(loadDone("2026-11-19", "draw")).toBeNull();
    expect(loadDone("2026-11-20", "guided")).toBeNull();
  });

  it("accepts draw as a remembered mode", () => {
    savePreferences({ mode: "draw" });
    expect(loadPreferences()?.mode).toBe("draw");
  });
});
