// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

const button = () => screen.getByRole("button", { name: /^Theme:/ });

describe("ThemeToggle", () => {
  it("is a single button that starts on automatic", () => {
    render(<ThemeToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(button()).toHaveAccessibleName("Theme: automatic. Switch to light.");
  });

  it("cycles automatic → light → dark → automatic, remembering the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(button());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    await user.click(button());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(button()).toHaveAccessibleName("Theme: dark. Switch to automatic.");
    await user.click(button());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("picks up a theme already applied before hydration", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    expect(button()).toHaveAccessibleName("Theme: dark. Switch to automatic.");
  });
});
