"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { cn } from "@/components/ui";
import { brandTone } from "@/lib/brand-style";
import { switchBrand } from "@/app/(app)/brand/actions";

export type SwitcherBrand = { id: string; name: string; code: string };

// Segmented brand switcher. Every inventory screen follows the brand picked here.
export function BrandSwitcher({ brands, currentId, canSeeAll, dark }: { brands: SwitcherBrand[]; currentId: string | null; canSeeAll: boolean; dark?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (brands.length === 0) return null;
  const pick = (v: string) => start(async () => { await switchBrand(v); router.refresh(); });
  const options = [...brands.map((b) => ({ value: b.id, label: b.name, code: b.code })), ...(canSeeAll ? [{ value: "all", label: "All brands", code: "" }] : [])];
  const active = currentId ?? "all";

  if (brands.length === 1) {
    const t = brandTone(brands[0].code);
    return (
      <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", dark ? "bg-white/5 text-white ring-1 ring-white/10" : "bg-slate-100")}>
        <span className={cn("size-2.5 rounded-full", t.dot)} /> {brands[0].name}
      </div>
    );
  }
  return (
    <div className={cn("rounded-xl p-1", dark ? "bg-black/20 ring-1 ring-white/10" : "bg-slate-100", pending && "opacity-70")} role="radiogroup" aria-label="Brand">
      <div className="grid grid-cols-2 gap-1">
        {options.map((o) => {
          const on = o.value === active;
          const t = brandTone(o.code);
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => !on && pick(o.value)}
              className={cn("flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition",
                o.value === "all" && options.length % 2 === 1 && "col-span-2",
                on ? (o.code ? t.solid : "bg-white text-slate-900") + " shadow-sm"
                   : dark ? "text-gray-300 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-white")}>
              {o.code ? <span className={cn("size-2 shrink-0 rounded-full", on ? "bg-white" : t.dot)} /> : <Layers className="size-3.5 shrink-0" />}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

