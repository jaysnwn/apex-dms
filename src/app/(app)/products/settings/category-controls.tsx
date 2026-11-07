"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { deleteCategory, moveCategory, reassignCategory } from "../actions";

// Up / down (display order in the billing catalogue), delete when unused, move products.
export function CategoryControls({ id, name, count, first, last, others }: { id: string; name: string; count: number; first: boolean; last: boolean; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { setError(null); const r = await fn(); if (r.error) setError(r.error); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-slate-500">{count} product{count === 1 ? "" : "s"}</span>
      <button type="button" disabled={pending || first} onClick={() => run(() => moveCategory(id, "up"))} className="grid size-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label={`Move ${name} up`}><ArrowUp className="size-3.5" /></button>
      <button type="button" disabled={pending || last} onClick={() => run(() => moveCategory(id, "down"))} className="grid size-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label={`Move ${name} down`}><ArrowDown className="size-3.5" /></button>
      {count > 0 ? (
        <select disabled={pending} defaultValue="" onChange={(e) => { const to = e.target.value; if (to && confirm(`Move all ${count} product(s) from ${name} to ${others.find((o) => o.id === to)?.name}?`)) run(() => reassignCategory(id, to)); e.target.value = ""; }}
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs" aria-label={`Move products of ${name}`}>
          <option value="" disabled>Move products to…</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      ) : (
        <button type="button" disabled={pending} onClick={() => confirm(`Delete the category ${name}?`) && run(() => deleteCategory(id))} className="grid size-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${name}`}><Trash2 className="size-3.5" /></button>
      )}
      {error && <span className="w-full text-xs text-red-700">{error}</span>}
    </div>
  );
}
