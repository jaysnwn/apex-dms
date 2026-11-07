"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Bus, Camera, Car, Check, Fuel, MoreHorizontal, Plus, Receipt, Utensils } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { EXPENSE_CATEGORY, EXPENSE_STATUS } from "@/lib/status";
import { submitExpense } from "../../(app)/expenses/actions";
import { Sheet } from "../ui";

export type MyExpense = { id: string; expense_date: string; category: string; amount: number; description: string | null; status: string; rejection_reason: string | null };

const ICON: Record<string, { icon: typeof Fuel; tone: string }> = {
  fuel: { icon: Fuel, tone: "bg-orange-100 text-orange-700" },
  food: { icon: Utensils, tone: "bg-emerald-100 text-emerald-700" },
  parking: { icon: Car, tone: "bg-sky-100 text-sky-700" },
  accommodation: { icon: BedDouble, tone: "bg-violet-100 text-violet-700" },
  travel: { icon: Bus, tone: "bg-cyan-100 text-cyan-700" },
  other: { icon: MoreHorizontal, tone: "bg-slate-200 text-slate-700" },
};

export function ExpenseScreen({ userId, expenses, routeId, openAdd, monthStart }: { userId: string; expenses: MyExpense[]; routeId: string | null; openAdd: boolean; monthStart: string }) {
  const [adding, setAdding] = useState(openAdd);
  const month = expenses.filter((e) => e.expense_date >= monthStart && e.status !== "rejected");
  const sumBy = (s: string) => expenses.filter((e) => e.status === s).reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-xl font-bold">My expenses</h1>
        <button onClick={() => setAdding(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-sm font-semibold text-white shadow-sm active:scale-95"><Plus className="size-4" /> Add expense</button>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-rose-600 to-rose-800 p-5 text-white shadow-md">
        <div className="text-sm text-rose-100">Spent this month</div>
        <div className="tabular text-3xl font-bold">{inr(month.reduce((t, e) => t + Number(e.amount), 0), { decimals: false })}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-white/15 px-3 py-2"><div className="text-[11px] text-rose-100">Waiting approval</div><div className="tabular font-semibold">{inr(sumBy("submitted"), { decimals: false })}</div></div>
          <div className="rounded-xl bg-white/15 px-3 py-2"><div className="text-[11px] text-rose-100">Approved, to be paid</div><div className="tabular font-semibold">{inr(sumBy("approved"), { decimals: false })}</div></div>
        </div>
      </section>

      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        {expenses.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No expenses this month.</li>}
        {expenses.map((e) => {
          const ic = ICON[e.category] ?? ICON.other;
          const st = EXPENSE_STATUS[e.status];
          return (
            <li key={e.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", ic.tone)}><ic.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{EXPENSE_CATEGORY[e.category] ?? e.category}</span>
                <span className="block truncate text-xs text-slate-500">{date(e.expense_date)}{e.description ? ` · ${e.description}` : ""}</span>
                {e.status === "rejected" && e.rejection_reason && <span className="block text-xs text-red-700">{e.rejection_reason}</span>}
              </span>
              <span className="text-right">
                <span className="tabular block font-semibold">{inr(e.amount, { decimals: false })}</span>
                <Badge tone={st.tone}>{st.label}</Badge>
              </span>
            </li>
          );
        })}
      </ul>

      {adding && <AddExpense userId={userId} routeId={routeId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddExpense({ userId, routeId, onClose }: { userId: string; routeId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState("fuel");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(todayIST());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const uuid = useRef(crypto.randomUUID());

  async function save() {
    setError(null);
    const amt = Number(amount);
    if (!(amt > 0)) return setError("Enter the amount.");
    if (!navigator.onLine) return setError("No internet. Try again when online.");
    setBusy(true);
    let path: string | null = null;
    if (file) {
      path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.]+/g, "_")}`;
      const { error: up } = await createClient().storage.from("expense-receipts").upload(path, file);
      if (up) { setBusy(false); return setError(`Photo upload failed: ${up.message}`); }
    }
    const res = await submitExpense({ category, amount: amt, date: day, description: note, routeId, receiptPath: path, clientUuid: uuid.current });
    setBusy(false);
    if (res.error) return setError(res.error);
    setDone(true);
    router.refresh();
  }

  return (
    <Sheet title={done ? "Expense submitted" : "Add expense"} onClose={onClose}
      footer={done ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setDone(false); setAmount(""); setNote(""); setFile(null); uuid.current = crypto.randomUUID(); }} className="h-12 rounded-2xl bg-white font-semibold ring-1 ring-slate-300">Add another</button>
          <button onClick={onClose} className="h-12 rounded-2xl bg-ink-900 font-semibold text-white">Done</button>
        </div>
      ) : (
        <>
          {error && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
          <button disabled={busy} onClick={save} className="h-14 w-full rounded-2xl bg-rose-600 text-lg font-bold text-white disabled:opacity-60">{busy ? "Saving…" : "Submit for approval"}</button>
        </>
      )}>
      {done ? (
        <div className="py-6 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white"><Check className="size-9" strokeWidth={3} /></span>
          <p className="mt-3 text-lg font-semibold">{inr(Number(amount), { decimals: false })} sent for approval</p>
          <p className="text-sm text-slate-500">Your manager will approve it.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(EXPENSE_CATEGORY).map(([k, label]) => {
              const ic = ICON[k] ?? ICON.other;
              return (
                <button key={k} onClick={() => setCategory(k)} className={cn("flex flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-semibold ring-1", category === k ? "bg-rose-50 text-rose-800 ring-2 ring-rose-500" : "bg-white text-slate-700 ring-slate-200")}>
                  <span className={cn("grid size-10 place-items-center rounded-xl", ic.tone)}><ic.icon className="size-5" /></span>{label}
                </button>
              );
            })}
          </div>
          <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ Amount" className="tabular h-16 w-full rounded-2xl border border-slate-300 px-4 text-center text-3xl font-bold outline-none focus:border-rose-500" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={day} max={todayIST()} onChange={(e) => setDay(e.target.value)} className="h-12 rounded-xl border border-slate-300 px-3 text-base" />
            <label className={cn("flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium", file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-dashed border-slate-300 text-slate-600")}>
              {file ? <Receipt className="size-4" /> : <Camera className="size-4" />} {file ? "Bill photo added" : "Bill photo"}
              <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. Petrol, Akole route)" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </div>
      )}
    </Sheet>
  );
}
