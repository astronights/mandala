// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatLong } from "@/lib/mandala";
import AdminClient from "./AdminClient";

afterEach(() => vi.useRealTimers());

describe("AdminClient", () => {
  it("shows today plus past and upcoming days, and navigates between them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 12, 0));
    const user = userEvent.setup();
    const { container } = render(<AdminClient />);

    expect(await screen.findByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-18"));
    expect(screen.getByText("live today")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Past days" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeInTheDocument();
    expect(container.querySelectorAll("svg[role=img]")).toHaveLength(21);

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-17"));
    await user.click(screen.getByRole("button", { name: "back to today" }));
    expect(screen.getByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-18"));

    await user.click(screen.getByRole("button", { name: /Fri, Nov 20, 2026|20 Nov/ }));
    expect(screen.getByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-20"));
  });

  it("switches to line art and explores other seeds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 12, 0));
    const user = userEvent.setup();
    const { container } = render(<AdminClient />);
    await screen.findByTestId("admin-date");
    const firstPath = () => container.querySelector("path[data-index='0']")!.getAttribute("d");
    const before = firstPath();

    await user.click(screen.getByRole("button", { name: "line art" }));
    expect(container.querySelector("path[data-index='0']")).toHaveAttribute("fill", "var(--paper)");

    const seed = screen.getByRole("textbox");
    await user.clear(seed);
    await user.type(seed, "another");
    expect(firstPath()).not.toBe(before);
  });
});
