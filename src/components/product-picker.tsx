"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeSearch } from "@/lib/format";
import { BarcodeScanButton } from "./barcode-scanner";
import { Input } from "./ui";

export type PickedProduct = { id: string; name: string; sku: string; brand_name: string; unit_code: string };

// Search-as-you-type product chooser (name, SKU or barcode). Writes the chosen
// product id into a hidden input named `name`.
export function ProductPicker({
  name = "product_id",
  initial,
  onChange,
  required = true,
}: {
  name?: string;
  initial?: PickedProduct | null;
  onChange?: (p: PickedProduct | null) => void;
  required?: boolean;
}) {
  const [picked, setPicked] = useState<PickedProduct | null>(initial ?? null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const term = safeSearch(q);
    if (term.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("catalog")
        .select("id, name, sku, brand_name, unit_code")
        .eq("is_active", true)
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`)
        .order("name")
        .limit(12);
      setResults((data ?? []) as PickedProduct[]);
      setOpen(true);
    }, 200);
  }, [q]);

  function choose(p: PickedProduct | null) {
    setPicked(p);
    onChange?.(p);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={picked?.id ?? ""} required={required} />
      {picked ? (
        <div className="flex h-10 items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm">
          <span className="truncate">
            <span className="font-medium">{picked.name}</span>{" "}
            <span className="text-slate-500">· {picked.sku} · {picked.brand_name}</span>
          </span>
          <button type="button" onClick={() => choose(null)} className="ml-2 text-xs font-medium text-accent-700 hover:underline">
            Change
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Type product name, model or barcode…"
            autoComplete="off"
          />
          <BarcodeScanButton label="Scan" onDetected={(code) => setQ(code)} />
        </div>
      )}
      {open && !picked && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No products found</li>
          ) : (
            results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-slate-500"> · {p.sku} · {p.brand_name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
