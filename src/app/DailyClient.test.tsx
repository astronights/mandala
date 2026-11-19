// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadPreferences } from "@/lib/storage/progress";
import DailyClient, { dayLabel } from "./DailyClient";

afterEach(() => vi.useRealTimers());

describe("DailyClient", () => {
  it("shows only today's mandala, with no way to browse other days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 9, 0));
    const { container } = render(<DailyClient />);
    expect(await screen.findByTestId("today")).toHaveTextContent(/18/);
    expect(container.querySelectorAll("svg[role=img]")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /previous day|next day/i })).toBeNull();
  });

  it("moves to the new day when the tab returns after midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 23, 59));
    render(<DailyClient />);
    const before = (await screen.findByTestId("today")).textContent;
    vi.setSystemTime(new Date(2026, 10, 19, 0, 1));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("today").textContent).not.toBe(before);
  });

  it("starts guided and remembers a switch to free colouring", async () => {
    const user = userEvent.setup();
    const first = render(<DailyClient />);
    const group = await screen.findByRole("group", { name: "Mode" });
    expect(screen.getByRole("button", { name: "Guided" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("radio", { name: "Eraser" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Free" }));
    expect(screen.getByRole("radio", { name: "Eraser" })).toBeInTheDocument();
    expect(loadPreferences()?.mode).toBe("free");
    expect(group).toBeInTheDocument();
    first.unmount();

    render(<DailyClient />);
    expect(await screen.findByRole("button", { name: "Free" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers drawing as a third mode", async () => {
    const user = userEvent.setup();
    render(<DailyClient />);
    await user.click(await screen.findByRole("button", { name: "Draw" }));
    expect(screen.getByTestId("draw-surface")).toBeInTheDocument();
    expect(loadPreferences()?.mode).toBe("draw");
  });

  it("moves to the new day at midnight even if the page stays open", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval"] });
    vi.setSystemTime(new Date(2026, 10, 18, 23, 59, 30));
    render(<DailyClient />);
    const before = screen.getByTestId("today").textContent;
    vi.setSystemTime(new Date(2026, 10, 19, 0, 0, 30));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId("today").textContent).not.toBe(before);
  });
});

describe("dayLabel", () => {
  it("numbers days from launch", () => {
    expect(dayLabel("2026-11-19")).toMatch(/^No\. 1 · /);
    expect(dayLabel("2026-11-20")).toMatch(/^No\. 2 · /);
    expect(dayLabel("2026-11-18")).not.toMatch(/No\./);
  });
});
