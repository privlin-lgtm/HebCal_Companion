import { useEffect, useState } from "react";
import type { Theme } from "../application/ports";

export function useTheme(themeStore: ReturnType<typeof import("../infrastructure/themeStore").createThemeStore>) {
  const [theme, setThemeState] = useState<Theme>(themeStore.get());
  const [resolved, setResolved] = useState<"light" | "dark">(themeStore.resolved());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(themeStore.resolved());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeStore]);

  const setTheme = (t: Theme) => {
    themeStore.set(t);
    setThemeState(t);
    setResolved(themeStore.resolved());
  };

  const toggle = () => setTheme(resolved === "dark" ? "light" : "dark");

  return { theme, resolved, setTheme, toggle };
}
