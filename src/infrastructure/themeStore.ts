import type { Theme, ThemeStore } from "../application/ports";

const THEME_KEY = "or-zarua-theme";

export function createThemeStore(): ThemeStore {
  function get(): Theme {
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch { /* ignore */ }
    return "system";
  }
  function set(theme: Theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    apply(theme);
  }
  function resolved(): "light" | "dark" {
    const theme = get();
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }
  function apply(theme: Theme) {
    const resolvedTheme = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }
  // Apply on init
  apply(get());
  // Listen for system changes
  if (typeof window !== "undefined") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (get() === "system") apply("system");
    });
  }
  return { get, set, resolved };
}