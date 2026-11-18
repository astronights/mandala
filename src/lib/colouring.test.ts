import { describe, expect, it } from "vitest";
import { colouringReducer, HISTORY_LIMIT, initialColouring, progress } from "./colouring";

describe("colouringReducer", () => {
  it("paints indices and records history", () => {
    const s = colouringReducer(initialColouring(), { type: "paint", indices: [1, 2], colour: 3 });
    expect(s.fills).toEqual({ 1: 3, 2: 3 });
    expect(s.past).toHaveLength(1);
  });

  it("ignores paints that change nothing", () => {
    const s1 = colouringReducer(initialColouring(), { type: "paint", indices: [1], colour: 0 });
    const s2 = colouringReducer(s1, { type: "paint", indices: [1], colour: 0 });
    expect(s2).toBe(s1);
    const s3 = colouringReducer(s1, { type: "paint", indices: [5], colour: null });
    expect(s3).toBe(s1);
  });

  it("erases with a null colour", () => {
    const s1 = colouringReducer(initialColouring({ 1: 0, 2: 0 }), {
      type: "paint",
      indices: [1],
      colour: null,
    });
    expect(s1.fills).toEqual({ 2: 0 });
  });

  it("undoes and redoes, and a new paint clears the redo stack", () => {
    let s = initialColouring();
    s = colouringReducer(s, { type: "paint", indices: [1], colour: 0 });
    s = colouringReducer(s, { type: "paint", indices: [2], colour: 1 });
    s = colouringReducer(s, { type: "undo" });
    expect(s.fills).toEqual({ 1: 0 });
    s = colouringReducer(s, { type: "redo" });
    expect(s.fills).toEqual({ 1: 0, 2: 1 });
    s = colouringReducer(s, { type: "undo" });
    s = colouringReducer(s, { type: "paint", indices: [3], colour: 2 });
    expect(s.future).toHaveLength(0);
    expect(colouringReducer(s, { type: "redo" })).toBe(s);
  });

  it("does nothing when there is nothing to undo, redo or clear", () => {
    const s = initialColouring();
    expect(colouringReducer(s, { type: "undo" })).toBe(s);
    expect(colouringReducer(s, { type: "redo" })).toBe(s);
    expect(colouringReducer(s, { type: "clear" })).toBe(s);
  });

  it("clear is undoable", () => {
    let s = initialColouring({ 1: 1 });
    s = colouringReducer(s, { type: "clear" });
    expect(s.fills).toEqual({});
    s = colouringReducer(s, { type: "undo" });
    expect(s.fills).toEqual({ 1: 1 });
  });

  it("load replaces state and resets history", () => {
    let s = colouringReducer(initialColouring(), { type: "paint", indices: [1], colour: 0 });
    s = colouringReducer(s, { type: "load", fills: { 9: 2 } });
    expect(s).toEqual({ fills: { 9: 2 }, past: [], future: [] });
  });

  it("caps history length", () => {
    let s = initialColouring();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) {
      s = colouringReducer(s, { type: "paint", indices: [i], colour: 0 });
    }
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("progress", () => {
  it("is the share of regions coloured", () => {
    expect(progress({}, 10)).toBe(0);
    expect(progress({ 0: 1, 1: 1 }, 10)).toBe(0.2);
    expect(progress({ 0: 1 }, 0)).toBe(0);
  });
});
