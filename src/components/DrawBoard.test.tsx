// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateMandala } from "@/lib/mandala";
import { loadDone, loadDrawing } from "@/lib/storage/progress";
import { DrawBoard, drawHint } from "./DrawBoard";

const DATE = "2026-11-18";
const mandala = generateMandala(DATE);
// Treat client coordinates as view coordinates: jsdom has no layout.
const toView = (_: SVGSVGElement, x: number, y: number) => [x, y] as [number, number];

afterEach(() => vi.restoreAllMocks());

function setup(props: Partial<Parameters<typeof DrawBoard>[0]> = {}) {
  const utils = render(<DrawBoard mandala={mandala} toView={toView} {...props} />);
  const surface = () => screen.getByTestId("draw-surface");
  const ptr = (type: string, id: number, x: number, y: number) =>
    fireEvent(
      surface(),
      Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), {
        pointerId: id,
      }),
    );
  const stroke = (pts: [number, number][], id = 1) => {
    ptr("pointerdown", id, ...pts[0]);
    for (const p of pts.slice(1)) ptr("pointermove", id, ...p);
    ptr("pointerup", id, ...pts[pts.length - 1]);
  };
  const copies = () => screen.getByTestId("strokes").querySelectorAll("path").length;
  return { ...utils, ptr, stroke, copies };
}

const zigzag: [number, number][] = [
  [10, 10],
  [40, 30],
  [70, 10],
  [100, 40],
];

describe("DrawBoard", () => {
  it("shows the day's pattern faintly as a stencil, with no colouring controls", () => {
    const { container } = setup({ persist: false });
    expect(container.querySelector("svg[role=img] > g")).toHaveAttribute("opacity", "0.32");
    expect(screen.queryByRole("radio", { name: "Eraser" })).toBeNull();
    expect(screen.getByTestId("stroke-count")).toHaveTextContent("0 strokes");
  });

  it("mirrors each stroke by the lines of symmetry", async () => {
    const user = userEvent.setup();
    const { stroke, copies } = setup({ persist: false });
    stroke(zigzag);
    expect(copies()).toBe(2 * mandala.symmetry);

    const group = screen.getByRole("group", { name: "Lines of symmetry" });
    await user.click(within(group).getByRole("button", { name: "No symmetry" }));
    expect(screen.getByText("Just this stroke")).toBeInTheDocument();
    stroke(zigzag);
    expect(copies()).toBe(2 * mandala.symmetry + 1);
    expect(screen.getByTestId("stroke-count")).toHaveTextContent("2 strokes");
  });

  it("uses the chosen colour", async () => {
    const user = userEvent.setup();
    const { stroke } = setup({ persist: false });
    await user.click(screen.getByRole("radio", { name: "Colour 3" }));
    stroke(zigzag);
    const g = screen.getByTestId("strokes").querySelector("g")!;
    expect(g).toHaveAttribute("stroke", mandala.palette.colours[2].css);
  });

  it("drops the stroke in progress when a second finger starts a pinch", () => {
    const { ptr, copies } = setup({ persist: false });
    ptr("pointerdown", 1, 10, 10);
    ptr("pointermove", 1, 50, 50);
    ptr("pointerdown", 2, 200, 200);
    ptr("pointermove", 1, 90, 90);
    ptr("pointerup", 1, 90, 90);
    ptr("pointerup", 2, 200, 200);
    expect(copies()).toBe(0);
  });

  it("undoes and clears, and saves the drawing for later", async () => {
    const user = userEvent.setup();
    const first = setup();
    first.stroke(zigzag);
    first.stroke([
      [0, 0],
      [0, 80],
    ]);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("stroke-count")).toHaveTextContent("1 stroke");
    expect(loadDrawing(DATE)).toHaveLength(1);
    first.unmount();

    const second = setup();
    expect(second.copies()).toBe(2 * mandala.symmetry);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(second.copies()).toBe(0);
  });

  it("finishes with a countdown, reports it, and can carry on", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    const { stroke } = setup();
    expect(screen.queryByRole("button", { name: "I’m done" })).toBeNull();
    stroke(zigzag);
    await user.click(screen.getByRole("button", { name: "I’m done" }));

    expect(screen.getByText("Today’s drawing is complete")).toBeInTheDocument();
    expect(screen.queryByTestId("draw-surface")).toBeNull();
    expect(loadDone(DATE, "draw")).not.toBeNull();
    const sent = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(sent.at(-1)).toMatchObject({ mode: "draw", completed: true });

    await user.click(screen.getByRole("button", { name: "Keep drawing" }));
    expect(screen.getByTestId("draw-surface")).toBeInTheDocument();
    expect(loadDone(DATE, "draw")).toBeNull();
  });
});

describe("drawHint", () => {
  it("describes each level", () => {
    expect(drawHint(0, 12)).toBe("Just this stroke");
    expect(drawHint(2, 12)).toBe("2 mirror lines");
    expect(drawHint(12, 12)).toBe("Mirrored all round");
  });
});
