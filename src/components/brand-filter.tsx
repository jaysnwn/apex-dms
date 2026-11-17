import Link from "next/link";
import { Layers } from "lucide-react";
import { cn } from "@/components/ui";
import { brandTone } from "@/lib/brand-style";

type B = { id: string; name: string; code: string };

// Per-page brand filter: All · BLUEI · CONQRETE. It only changes what this page
// shows (?brand=CODE); nothing is remembered across pages.
export function BrandFilter({ brands, current, path, params = {}, label = "Show", className }: {
  brands: B[]; current: B | null; path: string; params?: Record<string, string | string[] | undefined>; label?: string; className?: string;
}) {
  if (brands.length < 2) return null;
  const href = (code: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "brand" || k === "page" || v == null) continue;
      for (const x of Array.isArray(v) ? v : [v]) if (x !== "") q.append(k, x);
    }
    if (code) q.set("brand", code);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const opts = [{ code: null as string | null, name: "All brands" }, ...brands.map((b) => ({ code: b.code, name: b.name }))];
  return (
    <div className={cn("mb-5 flex flex-wrap items-center gap-2", className)} role="group" aria-label="Brand filter">
      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      {opts.map((o) => {
        const on = (current?.code ?? null) === o.code;
        const t = brandTone(o.code);
        return (
          <Link key={o.code ?? "all"} href={href(o.code)} aria-current={on ? "page" : undefined}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition",
              on ? (o.code ? t.solid + " ring-transparent" : "bg-slate-900 text-white ring-transparent") : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}>
            {o.code ? <span className={cn("size-2 rounded-full", on ? "bg-white" : t.dot)} /> : <Layers className="size-3.5" />}
            {o.name}
          </Link>
        );
      })}
    </div>
  );
}
