// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateMandala, SymmetryIndex } from "@/lib/mandala";
import { loadProgress, savePreferences, saveProgress } from "@/lib/storage/progress";
import { targetColours } from "@/lib/guided";
import { ColouringBoard, symmetryHint } from "./ColouringBoard";

const DATE = "2026-11-18";
const mandala = generateMandala(DATE);
const index = new SymmetryIndex(mandala);
const colour = (i: number) => mandala.palette.colours[i].css;

const paths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<SVGPathElement>("path[data-index]"));
const filledWith = (container: HTMLElement, css: string) =>
  paths(container).filter((p) => p.getAttribute("fill") === css);
const piece = (container: HTMLElement, i: number) =>
  container.querySelector<SVGPathElement>(`path[data-index="${i}"]`)!;
const symmetryGroup = () => screen.getByRole("group", { name: "Lines of symmetry" });

// A piece in a repeated ring, away from the centre.
const target = mandala.regions.findIndex((r) => r.rotate !== 0 && r.group.endsWith("-motif"));

describe("ColouringBoard (free)", () => {
  it("renders every piece unfilled with the day's palette", () => {
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} persist={false} />);
    expect(paths(container)).toHaveLength(mandala.regions.length);
    expect(paths(container).every((p) => p.getAttribute("fill") === "var(--paper)")).toBe(true);
    expect(screen.getAllByRole("radio")).toHaveLength(mandala.palette.colours.length + 1);
    expect(screen.getByTestId("progress")).toHaveTextContent("0% coloured");
  });

  it("offers off plus each divisor of the day's symmetry, defaulting to full", () => {
    render(<ColouringBoard mode="free" mandala={mandala} persist={false} />);
    const buttons = within(symmetryGroup()).getAllByRole("button");
    const expected = [0];
    for (let k = 1; k <= mandala.symmetry; k++) if (mandala.symmetry % k === 0) expected.push(k);
    expect(buttons.map((b) => b.textContent)).toEqual(
      expected.map((k) => (k === 0 ? "off" : `${k}`)),
    );
    expect(buttons.at(-1)).toHaveAttribute("aria-pressed", "true");
  });

  it("fills every matching piece in one tap at full symmetry", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} persist={false} />);
    await user.click(piece(container, target));
    expect(filledWith(container, colour(0))).toHaveLength(
      index.orbit(target, mandala.symmetry).length,
    );
    expect(filledWith(container, colour(0)).length).toBeGreaterThanOrEqual(mandala.symmetry);
  });

  it("fills a single piece with symmetry off, and its mirror pair with one line", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} persist={false} />);
    await user.click(within(symmetryGroup()).getByRole("button", { name: "No symmetry" }));
    expect(screen.getByText("One piece at a time")).toBeInTheDocument();
    await user.click(piece(container, target));
    expect(filledWith(container, colour(0))).toHaveLength(1);

    await user.click(within(symmetryGroup()).getByRole("button", { name: "1 line" }));
    await user.click(screen.getByRole("radio", { name: "Colour 2" }));
    await user.click(piece(container, target));
    expect(filledWith(container, colour(1))).toHaveLength(index.orbit(target, 1).length);
  });

  it("uses the selected colour, erases, and supports undo/redo/clear", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} persist={false} />);
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    const clear = screen.getByRole("button", { name: "Clear" });
    expect(undo).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Colour 3" }));
    await user.click(piece(container, target));
    const n = filledWith(container, colour(2)).length;
    expect(n).toBeGreaterThan(0);
    expect(screen.getByTestId("progress")).not.toHaveTextContent("0% coloured");

    await user.click(screen.getByRole("radio", { name: "Eraser" }));
    await user.click(piece(container, target));
    expect(filledWith(container, colour(2))).toHaveLength(0);

    await user.click(undo);
    expect(filledWith(container, colour(2))).toHaveLength(n);
    await user.click(redo);
    expect(filledWith(container, colour(2))).toHaveLength(0);
    await user.click(undo);

    await user.click(clear);
    expect(filledWith(container, colour(2))).toHaveLength(0);
    await user.click(undo);
    expect(filledWith(container, colour(2))).toHaveLength(n);
  });

  it("shows mirror-line guides for the chosen symmetry", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} persist={false} />);
    await user.click(within(symmetryGroup()).getByRole("button", { name: "2 lines" }));
    const guides = screen.getByTestId("symmetry-guides");
    expect(guides.querySelectorAll("line")).toHaveLength(2);
    expect(guides).toHaveStyle({ opacity: "1" });
    expect(container.querySelector("[data-testid=symmetry-guides]")).not.toBeNull();
  });

  it("saves progress and restores it on reload", async () => {
    const user = userEvent.setup();
    const first = render(<ColouringBoard mode="free" mandala={mandala} />);
    await user.click(piece(first.container, target));
    const saved = loadProgress(DATE, "free");
    expect(Object.keys(saved?.fills ?? {}).length).toBeGreaterThan(0);
    first.unmount();

    const second = render(<ColouringBoard mode="free" mandala={mandala} />);
    expect(filledWith(second.container, colour(0)).length).toBe(Object.keys(saved!.fills).length);
  });

  it("drops saved fills that don't belong to this mandala", () => {
    saveProgress(DATE, { 0: 1, 999999: 1, 1: 99 }, "free");
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} />);
    expect(paths(container).filter((p) => p.getAttribute("fill") !== "var(--paper)")).toHaveLength(
      1,
    );
  });

  it("remembers the symmetry preference across days", async () => {
    savePreferences({ symmetry: 2 });
    render(<ColouringBoard mode="free" mandala={mandala} />);
    expect(within(symmetryGroup()).getByRole("button", { name: "2 lines" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("ColouringBoard tracking", () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => vi.restoreAllMocks());

  const reports = () => fetchSpy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

  it("reports nothing for simply opening the page", () => {
    const { unmount } = render(<ColouringBoard mode="free" mandala={mandala} />);
    unmount();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports progress and symmetry when the page is hidden after colouring", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mode="free" mandala={mandala} />);
    await user.click(within(symmetryGroup()).getByRole("button", { name: "2 lines" }));
    await user.click(piece(container, target));
    window.dispatchEvent(new Event("pagehide"));
    expect(reports()).toHaveLength(1);
    expect(reports()[0]).toMatchObject({
      date: DATE,
      mode: "free", // free colouring reports as "free"; guided as "colour"
      version: mandala.version,
      symmetryLines: 2,
      completed: false,
    });
    expect(reports()[0].progress).toBeGreaterThan(0);
  });

  it("does not track when tracking is off", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <ColouringBoard mode="free" mandala={mandala} track={false} />,
    );
    await user.click(piece(container, target));
    unmount();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ColouringBoard (guided)", () => {
  const targets = targetColours(mandala);
  const first = targets[target];
  const swatch = (i: number) =>
    screen.getByRole("radio", { name: new RegExp(`^Colour ${i + 1}(, done)?$`) });
  const tinted = (container: HTMLElement) =>
    paths(container).filter((p) => p.getAttribute("fill")?.startsWith("color-mix"));

  it("has no eraser and starts on the first colour, with its pieces glowing", () => {
    const { container } = render(<ColouringBoard mandala={mandala} persist={false} />);
    expect(screen.queryByRole("radio", { name: "Eraser" })).toBeNull();
    expect(swatch(0)).toHaveAttribute("aria-checked", "true");
    const want0 = targets.filter((t) => t === 0).length;
    expect(tinted(container)).toHaveLength(want0);
  });

  it("fills pieces with their designed colour only", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mandala={mandala} persist={false} />);
    await user.click(swatch(first));
    await user.click(piece(container, target));
    const filled = filledWith(container, colour(first));
    expect(filled.length).toBeGreaterThan(0);
    for (const p of filled) expect(targets[Number(p.dataset.index)]).toBe(first);
  });

  it("points at the right colour instead of colouring a piece wrongly", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mandala={mandala} persist={false} />);
    const wrong = (first + 1) % mandala.palette.colours.length;
    await user.click(swatch(wrong));
    await user.click(piece(container, target));
    expect(piece(container, target).getAttribute("fill")).not.toBe(colour(wrong));
    expect(screen.getByText(`That piece wants colour ${first + 1}`)).toBeInTheDocument();
  });

  it("ticks off a finished colour and moves to the next one by itself", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mandala={mandala} persist={false} />);
    await user.click(swatch(first));
    // Full symmetry: tap one piece of each geometry wanting this colour.
    const seen = new Set<number>();
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] !== first || seen.has(i)) continue;
      for (const j of index.orbit(i, mandala.symmetry)) seen.add(j);
      await user.click(piece(container, i));
    }
    expect(swatch(first)).toHaveAccessibleName(`Colour ${first + 1}, done`);
    expect(swatch(first)).toHaveAttribute("aria-checked", "false");
    const next = screen
      .getAllByRole("radio")
      .find((r) => r.getAttribute("aria-checked") === "true");
    expect(next).toBeDefined();
  });

  it("counts progress by pieces in their designed colour", async () => {
    const user = userEvent.setup();
    const { container } = render(<ColouringBoard mandala={mandala} persist={false} />);
    await user.click(swatch(first));
    await user.click(piece(container, target));
    const expected = Math.round(
      (filledWith(container, colour(first)).length / mandala.regions.length) * 100,
    );
    expect(screen.getByTestId("progress")).toHaveTextContent(`${expected}% coloured`);
  });

  it("keeps its own saved canvas, ignoring colours that don't belong", () => {
    const wrong = (targets[0] + 1) % mandala.palette.colours.length;
    saveProgress(DATE, { 0: wrong, [target]: first }, "guided");
    const { container } = render(<ColouringBoard mandala={mandala} />);
    expect(piece(container, target).getAttribute("fill")).toBe(colour(first));
    expect(piece(container, 0).getAttribute("fill")).not.toBe(colour(wrong));
  });
});

describe("symmetryHint", () => {
  it("describes each level", () => {
    expect(symmetryHint(0, 12)).toBe("One piece at a time");
    expect(symmetryHint(1, 12)).toBe("1 mirror line");
    expect(symmetryHint(4, 12)).toBe("4 mirror lines");
    expect(symmetryHint(12, 12)).toBe("All matching pieces");
  });
});
