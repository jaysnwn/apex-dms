"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, cn } from "@/components/ui";
import { inr } from "@/lib/format";
import type { ExpenseCategory } from "@/lib/expense-labels";
import { saveExpenseCategory } from "../actions";

type Draft = Omit<ExpenseCategory, "id" | "code"> & { id?: string };

function rule(c: ExpenseCategory) {
  if (!c.approval_required) return "Approved automatically";
  if (Number(c.auto_approve_limit) > 0) return `Auto-approved up to ${inr(c.auto_approve_limit, { decimals: false })}`;
  return "Always needs approval";
}

export function CategoryEditor({ categories, counts }: { categories: ExpenseCategory[]; counts: Record<string, number> }) {
  const [edit, setEdit] = useState<Draft | null>(null);
  const next = (Math.max(0, ...categories.map((c) => c.sort_order)) || 0) + 10;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Order</th><th className="px-3 py-2.5">Category</th><th className="px-3 py-2.5">Receipt</th><th className="px-3 py-2.5">Route</th><th className="px-3 py-2.5">Approval</th><th className="px-3 py-2.5 text-right">Used</th><th className="px-4 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id} className={cn(!c.is_active && "text-slate-400")}>
                <td className="tabular px-4 py-2.5">{c.sort_order}</td>
                <td className="px-3 py-2.5 font-medium">{c.name} {!c.is_active && <Badge>Disabled</Badge>}</td>
                <td className="px-3 py-2.5">{c.receipt_required ? <Badge tone="amber">Required</Badge> : "Optional"}</td>
                <td className="px-3 py-2.5">{c.route_required ? <Badge tone="blue">Required</Badge> : "Optional"}</td>
                <td className="px-3 py-2.5 text-xs">{rule(c)}</td>
                <td className="tabular px-3 py-2.5 text-right">{counts[c.id] ?? 0}</td>
                <td className="px-4 py-2.5 text-right"><button className="text-sm text-accent-700 hover:underline" onClick={() => setEdit({ ...c })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div>
        {edit ? <CategoryForm key={edit.id ?? "new"} initial={edit} onDone={() => setEdit(null)} /> : (
          <Card className="p-5">
            <p className="mb-3 text-sm text-slate-600">Rules apply to new and resubmitted expenses in both the office and the salesman app.</p>
            <Button onClick={() => setEdit({ name: "", receipt_required: false, route_required: false, approval_required: true, auto_approve_limit: 0, is_active: true, sort_order: next })}><Plus className="size-4" /> Add category</Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function CategoryForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (k: "receipt_required" | "route_required" | "approval_required" | "is_active", label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 size-4 accent-ink-900" checked={d[k]} onChange={(e) => set(k, e.target.checked)} />
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">{d.id ? `Edit ${initial.name}` : "New category"}</h2>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={60} autoFocus /></div>
        <div><Label hint="lower comes first">Display order</Label><Input type="number" min={0} value={d.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} /></div>
        {toggle("receipt_required", "Receipt required", "An expense cannot be submitted without a photo or PDF of the bill.")}
        {toggle("route_required", "Route required", "The salesman's route is filled in automatically; it cannot be left empty.")}
        {toggle("approval_required", "Needs approval", "Off = approved as soon as it is submitted.")}
        {d.approval_required && (
          <div><Label hint="0 = every claim needs approval">Auto-approve claims up to (₹)</Label><Input type="number" min={0} step="1" value={d.auto_approve_limit} onChange={(e) => set("auto_approve_limit", Number(e.target.value))} /></div>
        )}
        {toggle("is_active", "In use", "Disabled categories disappear from the forms but stay on old expenses and in reports.")}
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          setError(null);
          const r = await saveExpenseCategory({ id: d.id ?? null, name: d.name, receipt_required: d.receipt_required, route_required: d.route_required, approval_required: d.approval_required, auto_approve_limit: Number(d.auto_approve_limit) || 0, is_active: d.is_active, sort_order: Number(d.sort_order) || 0 });
          if (!r.ok) return setError(r.error);
          onDone(); router.refresh();
        })}>{pending ? "Saving…" : "Save"}</Button>
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}
