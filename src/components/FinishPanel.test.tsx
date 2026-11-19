// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { FinishPanel } from "./FinishPanel";

describe("FinishPanel", () => {
  it("counts down to the next mandala and updates", () => {
    vi.useFakeTimers();
    let now = new Date(2026, 10, 19, 21, 30);
    render(<FinishPanel title="Done" now={() => now} />);
    expect(screen.getByTestId("countdown")).toHaveTextContent("2h 30m");
    now = new Date(2026, 10, 19, 23, 59, 30);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByTestId("countdown")).toHaveTextContent("less than a minute");
    vi.useRealTimers();
  });

  it("shows an action only when one is given", () => {
    const onAction = vi.fn();
    const { rerender } = render(<FinishPanel title="Done" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<FinishPanel title="Done" actionLabel="Keep drawing" onAction={onAction} />);
    screen.getByRole("button", { name: "Keep drawing" }).click();
    expect(onAction).toHaveBeenCalled();
  });
});
