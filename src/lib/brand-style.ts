// Colours per brand code, used for the switcher, badges and report headers.
export const BRAND_TONE: Record<string, { dot: string; pill: string; solid: string; hex: string }> = {
  CQ: { dot: "bg-orange-500", pill: "bg-orange-50 text-orange-800 ring-orange-600/20", solid: "bg-orange-500 text-white", hex: "#f28c18" },
  BL: { dot: "bg-sky-500", pill: "bg-sky-50 text-sky-800 ring-sky-600/20", solid: "bg-sky-600 text-white", hex: "#0284c7" },
};
const FALLBACK = { dot: "bg-slate-500", pill: "bg-slate-100 text-slate-700 ring-slate-500/20", solid: "bg-slate-700 text-white", hex: "#475569" };
export const brandTone = (code: string | null | undefined) => (code && BRAND_TONE[code]) || FALLBACK;
