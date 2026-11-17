// Display preferences, kept per device in cookies so the server can render the
// right theme on the first paint (no flash). UI only: nothing is stored in the database.
export type ThemePref = "light" | "dark" | "system";
export type DensityPref = "comfortable" | "compact";
export type MotionPref = "full" | "reduce";

export type Prefs = { theme: ThemePref; density: DensityPref; motion: MotionPref };

export const PREF_COOKIES = { theme: "dms_theme", density: "dms_density", motion: "dms_motion" } as const;
export const DEFAULT_PREFS: Prefs = { theme: "light", density: "comfortable", motion: "full" };

export function readPrefs(get: (name: string) => string | undefined): Prefs {
  const theme = get(PREF_COOKIES.theme);
  const density = get(PREF_COOKIES.density);
  const motion = get(PREF_COOKIES.motion);
  return {
    theme: theme === "dark" || theme === "system" ? theme : "light",
    density: density === "compact" ? "compact" : "comfortable",
    motion: motion === "reduce" ? "reduce" : "full",
  };
}
