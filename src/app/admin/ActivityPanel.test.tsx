// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityReport } from "@/lib/admin/activity";
import { ActivityPanel, fillDays, formatDuration } from "./ActivityPanel";

const report: ActivityReport = {
  configured: true,
  from: "2026-11-16",
  to: "2026-11-19",
  totals: { devices: 5, active1d: 3, active7d: 4, plays: 6, finishes: 2 },
  daily: [
    {
      date: "2026-11-18",
      version: 1,
      symmetry: 12,
      ringCount: 7,
      pieceCount: 240,
      paletteScheme: "analogous",
      players: 4,
      finishers: 2,
      colourPlays: 4,
      drawPlays: 0,
      avgActiveSeconds: 312,
      avgProgress: 0.64,
    },
    {
      date: "2026-11-16",
      version: 1,
      symmetry: 8,
      ringCount: 6,
      pieceCount: 150,
      paletteScheme: "split",
      players: 2,
      finishers: 0,
      colourPlays: 2,
      drawPlays: 0,
      avgActiveSeconds: 40,
      avgProgress: 0.2,
    },
  ],
  symmetryUsage: [
    { lines: 0, plays: 1 },
    { lines: 12, plays: 5 },
  ],
  byFold: [
    { symmetry: 8, plays: 2, finishes: 0, avgActiveSeconds: 40 },
    { symmetry: 12, plays: 4, finishes: 2, avgActiveSeconds: 312 },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [42.4, "42s"],
    [312, "5m 12s"],
    [3725, "1h 02m"],
    [-5, "0s"],
  ])("%s → %s", (s, out) => expect(formatDuration(s)).toBe(out));
});

describe("fillDays", () => {
  it("fills days without plays with zeros, through today", () => {
    const days = fillDays(report, "2026-11-18");
    expect(days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(days[1]).toMatchObject({ players: 0, finishers: 0, symmetry: null });
  });
});

describe("ActivityPanel", () => {
  it("shows headline numbers, charts and the table", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(report));
    const { container } = render(<ActivityPanel today="2026-11-18" />);

    expect(await screen.findByText("Players today")).toBeInTheDocument();
    const tile = (label: string) => screen.getByText(label).parentElement!;
    expect(tile("Players today")).toHaveTextContent("4");
    expect(tile("Finished today")).toHaveTextContent("50% of players");
    expect(tile("Active devices")).toHaveTextContent("4");
    expect(tile("Average time today")).toHaveTextContent("5m 12s");

    expect(
      screen.getByRole("img", { name: /Players and finishers per day, 3 days/ }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg path")).toHaveLength(2);

    const sym = screen.getByRole("list", { name: "Plays by lines of symmetry" });
    expect(
      within(sym)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["off1", "125"]);
    const folds = screen.getByRole("list", { name: "Finish rate by pattern symmetry" });
    expect(within(folds).getByText("50%")).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("12-fold · 240 pieces");
  });

  it("refetches when the range changes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(report));
    const user = userEvent.setup();
    render(<ActivityPanel today="2026-11-18" />);
    await screen.findByText("Players today");
    fetchSpy.mockResolvedValue(Response.json(report));
    await user.click(screen.getByRole("button", { name: "90 days" }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith("/api/admin/activity?days=90", expect.anything()),
    );
  });

  it("explains how to connect a database", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ configured: false }));
    render(<ActivityPanel today="2026-11-18" />);
    expect(await screen.findByText("No database is connected yet.")).toBeInTheDocument();
  });

  it("says when there is nothing yet, and when loading fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ ...report, daily: [], totals: { ...report.totals, plays: 0 } }),
    );
    const { unmount } = render(<ActivityPanel today="2026-11-18" />);
    expect(await screen.findByText("No plays in this range yet.")).toBeInTheDocument();
    unmount();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    render(<ActivityPanel today="2026-11-18" />);
    expect(await screen.findByText("Couldn’t load activity.")).toBeInTheDocument();
  });
});
