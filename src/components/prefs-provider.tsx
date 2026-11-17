"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { PREF_COOKIES, type DensityPref, type MotionPref, type Prefs, type ThemePref } from "@/lib/prefs";

type Ctx = Prefs & {
  setTheme: (t: ThemePref) => void;
  setDensity: (d: DensityPref) => void;
  setMotion: (m: MotionPref) => void;
  reduced: boolean; // true when the app or the device asks for less motion
};

const PrefsContext = createContext<Ctx | null>(null);

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: ThemePref) {
  const dark = theme === "dark" || (theme === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
}

export function PrefsProvider({ initial, children }: { initial: Prefs; children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [osReduced, setOsReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    const on = () => setOsReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Follow the device when the theme is "system".
  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [prefs.theme]);

  const setTheme = useCallback((theme: ThemePref) => {
    writeCookie(PREF_COOKIES.theme, theme);
    const run = () => {
      applyTheme(theme);
      setPrefs((p) => ({ ...p, theme }));
    };
    // A soft crossfade where the browser supports it; instant otherwise or with reduced motion.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !reduce) doc.startViewTransition(run);
    else run();
  }, []);

  const setDensity = useCallback((density: DensityPref) => {
    writeCookie(PREF_COOKIES.density, density);
    document.documentElement.dataset.density = density;
    setPrefs((p) => ({ ...p, density }));
  }, []);

  const setMotion = useCallback((motion: MotionPref) => {
    writeCookie(PREF_COOKIES.motion, motion);
    document.documentElement.dataset.motion = motion;
    setPrefs((p) => ({ ...p, motion }));
  }, []);

  const reduced = prefs.motion === "reduce" || osReduced;
  const value = useMemo(() => ({ ...prefs, setTheme, setDensity, setMotion, reduced }), [prefs, setTheme, setDensity, setMotion, reduced]);

  return (
    <PrefsContext.Provider value={value}>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion={prefs.motion === "reduce" ? "always" : "user"}>{children}</MotionConfig>
      </LazyMotion>
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}
