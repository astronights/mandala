// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatLong } from "@/lib/mandala";
import AdminClient, { historyDates } from "./AdminClient";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ configured: false }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const openPatterns = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Patterns" }));
};

describe("AdminClient", () => {
  it("opens on activity", async () => {
    render(<AdminClient />);
    expect(await screen.findByRole("button", { name: "Activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await screen.findByText("No database is connected yet.")).toBeInTheDocument();
  });

  it("shows today plus past and upcoming days, and navigates between them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Three days after launch: No. 1, 2 and 3 are history.
    vi.setSystemTime(new Date(2026, 10, 21, 12, 0));
    const user = userEvent.setup();
    const { container } = render(<AdminClient />);
    await openPatterns(user);

    expect(await screen.findByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-21"));
    expect(screen.getByText("Mandala No. 3")).toBeInTheDocument();
    expect(screen.getByText("live today")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeInTheDocument();
    // Today's large view + 3 history days + 10 coming up.
    expect(container.querySelectorAll("svg[role=img]")).toHaveLength(14);
    expect(screen.queryByText(/Nov 18, 2026/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-20"));
    await user.click(screen.getByRole("button", { name: "back to today" }));
    expect(screen.getByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-21"));

    await user.click(screen.getByRole("button", { name: /Sun, Nov 22, 2026|22 Nov/ }));
    expect(screen.getByTestId("admin-date")).toHaveTextContent(formatLong("2026-11-22"));
  });

  it("switches to line art and explores other seeds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 21, 12, 0));
    const user = userEvent.setup();
    const { container } = render(<AdminClient />);
    await openPatterns(user);
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

describe("history on launch day", () => {
  it("has only No. 1, and the back arrow stops there", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 19, 12, 0));
    const user = userEvent.setup();
    const { container } = render(<AdminClient />);
    await openPatterns(user);
    expect(await screen.findByText("Mandala No. 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    expect(container.querySelectorAll("svg[role=img]")).toHaveLength(12);
  });
});

describe("historyDates", () => {
  it("lists live days from No. 1, newest first, capped", () => {
    expect(historyDates("2026-11-21")).toEqual(["2026-11-21", "2026-11-20", "2026-11-19"]);
    expect(historyDates("2026-11-19")).toEqual(["2026-11-19"]);
    expect(historyDates("2026-11-18")).toEqual([]);
    expect(historyDates("2027-06-01")).toHaveLength(30);
    expect(historyDates("2027-06-01", 5)[4]).toBe("2027-05-28");
  });
});
