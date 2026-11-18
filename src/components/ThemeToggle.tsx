"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./controls.module.css";

export type Theme = "auto" | "light" | "dark";
const ORDER: Theme[] = ["auto", "light", "dark"];
const LABEL: Record<Theme, string> = {
  auto: "Theme: automatic",
  light: "Theme: light",
  dark: "Theme: dark",
};

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {}
}

const ICONS: Record<Theme, ReactNode> = {
  // Half-filled circle: follows the device.
  auto: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  dark: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
};

/** One small button that cycles automatic → light → dark. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    // Sync with the value the inline head script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={`${LABEL[theme]}. Switch to ${next === "auto" ? "automatic" : next}.`}
      data-theme-choice={theme}
      onClick={() => {
        setTheme(next);
        applyTheme(next);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {ICONS[theme]}
      </svg>
    </button>
  );
}
