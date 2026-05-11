import { useEffect, useState, useCallback } from "react";

const MODE_KEY = "alyson-theme-mode";
const PALETTE_KEY = "alyson-theme-palette";
const LEGACY_KEY = "alyson-theme"; // previously stored "light" | "dark"

export type ThemeMode = "light" | "dark";
export type ThemePalette = "default" | "sapphire" | "emerald" | "rose" | "amber";

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  // Migrate legacy key if present.
  const legacy = localStorage.getItem(LEGACY_KEY) as ThemeMode | null;
  if (legacy === "light" || legacy === "dark") {
    localStorage.setItem(MODE_KEY, legacy);
    localStorage.removeItem(LEGACY_KEY);
    return legacy;
  }
  const stored = localStorage.getItem(MODE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialPalette(): ThemePalette {
  if (typeof window === "undefined") return "default";
  const stored = localStorage.getItem(PALETTE_KEY) as ThemePalette | null;
  if (stored === "default" || stored === "sapphire" || stored === "emerald" || stored === "rose" || stored === "amber") return stored;
  return "default";
}

function applyTheme(mode: ThemeMode, palette: ThemePalette) {
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  // Palette classes are additive to light/dark.
  for (const c of Array.from(root.classList)) {
    if (c.startsWith("theme-")) root.classList.remove(c);
  }
  if (palette !== "default") root.classList.add(`theme-${palette}`);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [palette, setPalette] = useState<ThemePalette>("default");

  useEffect(() => {
    const m = getInitialMode();
    const p = getInitialPalette();
    setMode(m);
    setPalette(p);
    applyTheme(m, p);
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(MODE_KEY, next);
      // Use current palette from state by reading latest localStorage fallback.
      const p = (localStorage.getItem(PALETTE_KEY) as ThemePalette | null) ?? "default";
      applyTheme(next, p === "sapphire" || p === "emerald" || p === "rose" || p === "amber" ? p : "default");
      return next;
    });
  }, []);

  const setThemePalette = useCallback(
    (next: ThemePalette) => {
      setPalette(next);
      localStorage.setItem(PALETTE_KEY, next);
      // Apply using current mode state.
      applyTheme(mode, next);
    },
    [mode],
  );

  return { theme: mode, mode, palette, toggle, setPalette: setThemePalette };
}
