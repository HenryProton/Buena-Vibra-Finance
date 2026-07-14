import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "system" | "light" | "dark" | "vibrant" | "senior";
type Ctx = { theme: Theme; setTheme: (t: Theme) => void; resolved: string };

const ThemeContext = createContext<Ctx | null>(null);

function apply(theme: Theme): string {
  if (typeof window === "undefined") return "light";
  const root = document.documentElement;
  // limpiar clases previas
  root.classList.remove("dark", "theme-vibrant", "theme-senior");

  let resolved: string = theme;
  if (theme === "system") {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    resolved = sysDark ? "dark" : "light";
  }

  if (resolved === "dark") root.classList.add("dark");
  else if (resolved === "vibrant") root.classList.add("theme-vibrant");
  else if (resolved === "senior") root.classList.add("theme-senior");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<string>("light");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("bv-theme")) as Theme | null;
    const initial = stored ?? "system";
    setThemeState(initial);
    setResolved(apply(initial));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("bv-theme") ?? "system") === "system") setResolved(apply("system"));
    };
    mq.addEventListener("change", onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "bv-theme") return;
      const next = (e.newValue as Theme | null) ?? "system";
      setThemeState(next);
      setResolved(apply(next));
    };
    window.addEventListener("storage", onStorage);
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (!next) return;
      setThemeState(next);
      setResolved(apply(next));
    };
    window.addEventListener("bv-theme-change", onCustom as EventListener);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("bv-theme-change", onCustom as EventListener);
    };
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem("bv-theme", t);
    setThemeState(t);
    setResolved(apply(t));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bv-theme-change", { detail: t }));
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
