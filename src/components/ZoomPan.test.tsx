// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ZoomPan } from "./ZoomPan";

/** jsdom has no layout: give the box a 400px square and real pointer coordinates. */
function setup() {
  const onTap = vi.fn();
  render(
    <ZoomPan radius={500}>
      <svg viewBox="-500 -500 1000 1000" onClick={onTap}>
        <rect data-testid="piece" width="10" height="10" />
      </svg>
    </ZoomPan>,
  );
  const box = screen.getByTestId("zoom-pan");
  Object.defineProperty(box, "clientWidth", { value: 400 });
  box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 }) as DOMRect;
  const svg = box.querySelector("svg")!;
  const piece = screen.getByTestId("piece");
  const ptr = (type: string, id: number, x: number, y: number, target: Element = piece) =>
    fireEvent(
      target,
      Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), {
        pointerId: id,
      }),
    );
  return { box, svg, piece, onTap, ptr };
}

const pinchOut = (ptr: ReturnType<typeof setup>["ptr"]) => {
  ptr("pointerdown", 1, 150, 200);
  ptr("pointerdown", 2, 250, 200);
  ptr("pointermove", 1, 100, 200);
  ptr("pointermove", 2, 300, 200);
  ptr("pointerup", 1, 100, 200);
  ptr("pointerup", 2, 300, 200);
};

describe("ZoomPan", () => {
  it("lets a still tap through to the drawing", () => {
    const { piece, onTap, ptr } = setup();
    ptr("pointerdown", 1, 100, 100);
    ptr("pointerup", 1, 102, 101);
    fireEvent.click(piece);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("swallows the click after a drag", () => {
    const { piece, onTap, ptr } = setup();
    ptr("pointerdown", 1, 100, 100);
    ptr("pointermove", 1, 140, 100);
    ptr("pointerup", 1, 140, 100);
    fireEvent.click(piece);
    expect(onTap).not.toHaveBeenCalled();
    // The next, still tap works again.
    ptr("pointerdown", 1, 100, 100);
    ptr("pointerup", 1, 100, 100);
    fireEvent.click(piece);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("pinches to zoom around the fingers, then shows a reset button", () => {
    const { box, svg, piece, onTap, ptr } = setup();
    pinchOut(ptr);
    // Fingers 100px → 200px apart around the centre: 2×, still on the middle.
    const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect([w, h]).toEqual([500, 500]);
    expect(Math.abs(x + 250)).toBeLessThan(20);
    expect(y).toBe(-250);
    expect(box).toHaveAttribute("data-zoomed", "true");
    fireEvent.click(piece);
    expect(onTap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Show the whole mandala" }));
    expect(svg.getAttribute("viewBox")).toBe("-500 -500 1000 1000");
    expect(screen.queryByRole("button", { name: "Show the whole mandala" })).toBeNull();
  });

  it("pans with one finger only when zoomed in", () => {
    const { svg, ptr } = setup();
    ptr("pointerdown", 1, 200, 200);
    ptr("pointermove", 1, 300, 200);
    ptr("pointerup", 1, 300, 200);
    expect(svg.getAttribute("viewBox")).toBe("-500 -500 1000 1000");

    pinchOut(ptr);
    const before = svg.getAttribute("viewBox")!.split(" ").map(Number);
    ptr("pointerdown", 1, 200, 200);
    ptr("pointermove", 1, 300, 200);
    ptr("pointerup", 1, 300, 200);
    // Dragging right by 100px at 2× moves the view 125 units left.
    const after = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(after[0] - before[0]).toBeCloseTo(-125, 1);
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it("zooms with a trackpad pinch (ctrl + wheel) but leaves plain scrolling alone", () => {
    const { box, svg } = setup();
    const plain = new WheelEvent("wheel", {
      deltaY: 100,
      clientX: 200,
      clientY: 200,
      cancelable: true,
    });
    box.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(svg.getAttribute("viewBox")).toBe("-500 -500 1000 1000");

    const pinch = new WheelEvent("wheel", {
      deltaY: -70,
      ctrlKey: true,
      clientX: 200,
      clientY: 200,
      cancelable: true,
    });
    box.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    expect(svg.getAttribute("viewBox")).not.toBe("-500 -500 1000 1000");
  });
});
