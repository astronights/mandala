// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readJSON, removeKey, writeJSON } from "./local";

const isNumber = (v: unknown): v is number => typeof v === "number";

describe("local storage helpers", () => {
  it("reads only valid values", () => {
    writeJSON("k", 5);
    expect(readJSON("k", isNumber)).toBe(5);
    writeJSON("k", "five");
    expect(readJSON("k", isNumber)).toBeNull();
    expect(readJSON("missing", isNumber)).toBeNull();
  });

  it("removes keys and tolerates failures", () => {
    writeJSON("k", 1);
    removeKey("k");
    expect(localStorage.getItem("k")).toBeNull();
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("nope");
    });
    expect(() => removeKey("k")).not.toThrow();
    spy.mockRestore();
  });
});
