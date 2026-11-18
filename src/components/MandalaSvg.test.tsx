// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { generateMandala } from "@/lib/mandala";
import { MandalaSvg, suggestedFills } from "./MandalaSvg";

const m = generateMandala("2026-11-18");

describe("MandalaSvg", () => {
  it("renders line art with every region and an accessible label", () => {
    const { container, getByRole } = render(<MandalaSvg mandala={m} />);
    expect(getByRole("img")).toHaveAccessibleName("Mandala for 2026-11-18");
    const paths = container.querySelectorAll("path[data-index]");
    expect(paths).toHaveLength(m.regions.length);
    expect(container.querySelector("g")).toHaveAttribute("stroke", "var(--line)");
  });

  it("applies suggested group fills with stained-glass lines", () => {
    const fills = suggestedFills(m);
    expect(Object.keys(fills)).toHaveLength(m.groups.length);
    const { container } = render(<MandalaSvg mandala={m} fills={fills} />);
    const first = container.querySelector("path[data-index='0']")!;
    expect(first.getAttribute("fill")).toBe(fills[m.regions[0].group]);
    expect(container.querySelector("g")).toHaveAttribute("stroke", "var(--line-on-colour)");
  });

  it("is not interactive without a tap handler", () => {
    const { getByRole } = render(<MandalaSvg mandala={m} />);
    expect(getByRole("img").style.cursor).toBe("");
  });
});
