"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BedDouble, Bus, Camera, Car, Check, Fuel, Mail, MoreHorizontal, Package, Phone, Plus, Receipt, Truck, Utensils, Wrench, type LucideIcon,
} from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { date, dateTime, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import {
  EVENT_LABEL, EXPENSE_PAYMENT_METHOD, EXPENSE_STATUS, REIMBURSE_METHOD, REIMBURSEMENT_STATUS,
  type ExpenseCategory, type ExpenseDetail, type ExpenseRow, type ExpenseSummary,
} from "@/lib/expense-labels";
import { deleteExpense, getExpenseDetail, saveExpense, submitExpense } from "../../(app)/expenses/actions";
import { uploadReceipt } from "../../(app)/expenses/expense-form";
import { Sheet } from "../ui";

// Icons by category code; categories added later by the office get the generic icon.
const ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  fuel: { icon: Fuel, tone: "bg-orange-100 text-orange-700" },
  food: { icon: Utensils, tone: "bg-emerald-100 text-emerald-700" },
  parking: { icon: Car, tone: "bg-sky-100 text-sky-700" },
  accommodation: { icon: BedDouble, tone: "bg-violet-100 text-violet-700" },
  travel: { icon: Bus, tone: "bg-cyan-100 text-cyan-700" },
  transportation: { icon: Truck, tone: "bg-indigo-100 text-indigo-700" },
  vehicle_maintenance: { icon: Wrench, tone: "bg-amber-100 text-amber-800" },
  loading_unloading: { icon: Package, tone: "bg-lime-100 text-lime-800" },
  courier: { icon: Mail, tone: "bg-pink-100 text-pink-700" },
  office_supplies: { icon: Receipt, tone: "bg-teal-100 text-teal-700" },
  telephone_internet: { icon: Phone, tone: "bg-blue-100 text-blue-700" },
};
const OTHER = { icon: MoreHorizontal, tone: "bg-slate-200 text-slate-700" };
const iconOf = (code: string | null | undefined) => (code && ICON[code]) || OTHER;

type Props = {
  userId: string;
  expenses: ExpenseRow[];
  categories: ExpenseCategory[];
  routes: { id: string; name: string }[];
  brands: { id: string; name: string; code: string }[];
  defaultRoute: string | null;
  openAdd: boolean;
  month: ExpenseSummary;
  toBePaid: number;
};

function StatusLine({ e }: { e: ExpenseRow }) {
  if (e.status === "approved" && e.reimbursement_status) {
    const r = REIMBURSEMENT_STATUS[e.reimbursement_status];
    return <Badge tone={r.tone}>{e.reimbursement_status === "not_applicable" ? "Approved" : r.label}</Badge>;
  }
  const s = EXPENSE_STATUS[e.status];
  return <Badge tone={s.tone}>{e.status === "returned" ? "Fix & resend" : s.label}</Badge>;
}

export function ExpenseScreen(p: Props) {
  const router = useRouter();
  const [form, setForm] = useState<{ edit?: ExpenseRow } | null>(p.openAdd ? {} : null);
  const [view, setView] = useState<string | null>(null);
  const catCode = new Map(p.categories.map((c) => [c.id, c.code]));

  // Status changes made in the office show up when the salesman comes back to the app.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onShow);
    const t = setInterval(onShow, 60000);
    return () => { document.removeEventListener("visibilitychange", onShow); clearInterval(t); };
  }, [router]);

  const attention = p.expenses.filter((e) => e.status === "returned" || e.status === "draft");
  const rest = p.expenses.filter((e) => e.status !== "returned" && e.status !== "draft");
  const closeForm = useCallback(() => setForm(null), []);
  const closeView = useCallback(() => setView(null), []);

  const item = (e: ExpenseRow) => {
    const ic = iconOf(catCode.get(e.category_id) ?? null);
    return (
      <li key={e.id}>
        <button onClick={() => setView(e.id)} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 active:bg-slate-50">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", ic.tone)}><ic.icon className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{e.category_name}</span>
            <span className="block truncate text-xs text-slate-500">{date(e.expense_date)}{e.description ? ` · ${e.description}` : ""}{e.created_by !== e.employee_id ? " · added by office" : ""}</span>
            {(e.status === "rejected" || e.status === "returned") && e.rejection_reason && <span className="block truncate text-xs text-red-700">{e.rejection_reason}</span>}
          </span>
          <span className="shrink-0 text-right">
            <span className="tabular block font-semibold">{inr(e.approved_amount ?? e.amount, { decimals: false })}</span>
            <StatusLine e={e} />
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-xl font-bold">My expenses</h1>
        <button onClick={() => setForm({})} className="flex h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-sm font-semibold text-white shadow-sm active:scale-95"><Plus className="size-4" /> Add expense</button>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-rose-600 to-rose-800 p-5 text-white shadow-md">
        <div className="text-sm text-rose-100">This month</div>
        <div className="tabular text-3xl font-bold">{inr(p.month.incurred, { decimals: false })}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Tile k="Waiting approval" v={p.month.pending} />
          <Tile k="Approved" v={p.month.approved} />
          <Tile k="Rejected" v={p.month.rejected} />
          <Tile k="Due to you" v={p.toBePaid} strong />
          <Tile k="Paid to you" v={p.month.reimbursed} />
          <Tile k="Company paid" v={p.month.company_paid} />
        </div>
      </section>

      {attention.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-amber-800">Needs your action</h2>
          <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-2 ring-amber-300">{attention.map(item)}</ul>
        </section>
      )}

      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        {rest.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No expenses this month yet. Tap “Add expense” to log one.</li>}
        {rest.map(item)}
      </ul>

      {form && <ExpenseSheet {...p} edit={form.edit} onClose={closeForm} />}
      {view && <DetailSheet id={view} catCode={catCode} onClose={closeView} onEdit={(e) => { setView(null); setForm({ edit: e }); }} />}
    </div>
  );
}

function Tile({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl px-2.5 py-2", strong ? "bg-white text-rose-800" : "bg-white/15")}>
      <div className={cn("text-[10px] leading-tight", strong ? "text-rose-700" : "text-rose-100")}>{k}</div>
      <div className="tabular font-semibold">{inr(v, { decimals: false })}</div>
    </div>
  );
}

function ExpenseSheet({ userId, categories, routes, brands, defaultRoute, edit, onClose }: Props & { edit?: ExpenseRow; onClose: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState(edit?.category_id ?? "");
  const [amount, setAmount] = useState(edit ? String(edit.amount) : "");
  const [day, setDay] = useState(edit?.expense_date ?? todayIST());
  const [route, setRoute] = useState(edit ? edit.route_id ?? "" : defaultRoute ?? "");
  const [brand, setBrand] = useState(edit?.brand_id ?? "");
  const [paidBy, setPaidBy] = useState<"employee" | "company">(edit?.paid_by ?? "employee");
  const [method, setMethod] = useState(edit?.payment_method ?? "cash");
  const [note, setNote] = useState(edit?.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [keep, setKeep] = useState(!!edit?.receipt_path);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ status: string; no: string | null } | null>(null);
  const uuid = useRef(crypto.randomUUID());
  const cat = categories.find((c) => c.id === category);
  const hasReceipt = !!file || keep;

  async function save(submit: boolean) {
    setError(null);
    const amt = Number(amount);
    if (!category) return setError("Choose what the expense was for.");
    if (!(amt > 0)) return setError("Enter the amount.");
    if (submit && cat?.receipt_required && !hasReceipt) return setError(`Add a photo of the bill — required for ${cat.name}.`);
    if (submit && cat?.route_required && !route) return setError(`Choose the route — required for ${cat.name}.`);
    if (!navigator.onLine) return setError("No internet. Try again when you are online.");
    setBusy(true);
    let receiptPath = keep ? edit?.receipt_path ?? null : null;
    if (file) {
      try { receiptPath = await uploadReceipt(userId, file); } catch (e) { setBusy(false); return setError((e as Error).message); }
    }
    const res = await saveExpense({
      id: edit?.id ?? null, categoryId: category, amount: amt, date: day, routeId: route || null, brandId: brand || null,
      description: note, paymentMethod: (method || null) as "cash" | null, paidBy, receiptPath, submit,
      clientUuid: edit ? null : uuid.current, source: "salesman_app",
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone({ status: res.status, no: res.expenseNo });
    router.refresh();
  }

  const again = () => {
    setDone(null); setAmount(""); setNote(""); setFile(null); setKeep(false); setCategory(""); uuid.current = crypto.randomUUID();
  };

  return (
    <Sheet title={done ? "Saved" : edit ? (edit.status === "returned" ? "Correct and resend" : "Edit draft") : "Add expense"} onClose={onClose}
      footer={done ? (
        <div className="grid grid-cols-2 gap-2">
          {!edit ? <button onClick={again} className="h-12 rounded-2xl bg-white font-semibold ring-1 ring-slate-300">Add another</button> : <span />}
          <button onClick={onClose} className="h-12 rounded-2xl bg-ink-900 font-semibold text-white">Done</button>
        </div>
      ) : (
        <>
          {error && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800" role="alert">{error}</p>}
          <button disabled={busy} onClick={() => save(true)} className="h-14 w-full rounded-2xl bg-rose-600 text-lg font-bold text-white disabled:opacity-60">{busy ? "Saving…" : edit?.status === "returned" ? "Resend for approval" : "Submit for approval"}</button>
          {(!edit || edit.status === "draft") && <button disabled={busy} onClick={() => save(false)} className="mt-2 h-10 w-full rounded-xl text-sm font-medium text-slate-600">Save as draft</button>}
        </>
      )}>
      {done ? (
        <div className="py-6 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white"><Check className="size-9" strokeWidth={3} /></span>
          <p className="mt-3 text-lg font-semibold">{inr(Number(amount), { decimals: false })} {done.status === "approved" ? "approved" : done.status === "submitted" ? "sent for approval" : "saved as draft"}</p>
          <p className="text-sm text-slate-500">{done.no ?? ""}{done.status === "submitted" ? " · your manager will review it" : ""}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-1.5">
            {categories.map((c) => {
              const ic = iconOf(c.code);
              return (
                <button key={c.id} onClick={() => setCategory(c.id)} className={cn("flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center text-[10.5px] leading-tight font-semibold ring-1", category === c.id ? "bg-rose-50 text-rose-800 ring-2 ring-rose-500" : "bg-white text-slate-700 ring-slate-200")}>
                  <span className={cn("grid size-9 place-items-center rounded-xl", ic.tone)}><ic.icon className="size-[18px]" /></span>{c.name}
                </button>
              );
            })}
          </div>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ Amount" aria-label="Amount"
            className="tabular h-16 w-full rounded-2xl border border-slate-300 px-4 text-center text-3xl font-bold outline-none focus:border-rose-500" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={day} max={todayIST()} onChange={(e) => setDay(e.target.value)} aria-label="Date" className="h-12 rounded-xl border border-slate-300 px-3 text-base" />
            <label className={cn("flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium", hasReceipt ? "border-emerald-400 bg-emerald-50 text-emerald-800" : cat?.receipt_required ? "border-amber-400 bg-amber-50 text-amber-800" : "border-dashed border-slate-300 text-slate-600")}>
              {hasReceipt ? <Receipt className="size-4" /> : <Camera className="size-4" />} {hasReceipt ? "Bill photo added" : cat?.receipt_required ? "Bill photo (required)" : "Bill photo"}
              <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setKeep(false); }} />
            </label>
          </div>
          {routes.length > 0 && (
            <select value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Route" className={cn("h-12 w-full rounded-xl border bg-white px-3 text-base", cat?.route_required && !route ? "border-amber-400" : "border-slate-300")}>
              <option value="">{cat?.route_required ? "Choose route (required)" : "No route"}</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(["employee", "company"] as const).map((x) => (
              <button key={x} onClick={() => setPaidBy(x)} className={cn("h-11 rounded-xl text-sm font-semibold ring-1", paidBy === x ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-slate-700 ring-slate-300")}>
                {x === "employee" ? "I paid" : "Company paid"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(EXPENSE_PAYMENT_METHOD).map(([k, v]) => (
              <button key={k} onClick={() => setMethod(k)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", method === k ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-600 ring-slate-300")}>{v}</button>
            ))}
          </div>
          {brands.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setBrand("")} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", !brand ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-slate-600 ring-slate-300")}>All brands</button>
              {brands.map((b) => <button key={b.id} onClick={() => setBrand(b.id)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", brand === b.id ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-slate-600 ring-slate-300")}>{b.name}</button>)}
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (e.g. Petrol, Akole route)" aria-label="Description" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base" />
          {edit?.status === "returned" && edit.rejection_reason && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Manager asked: {edit.rejection_reason}</p>}
        </div>
      )}
    </Sheet>
  );
}

function DetailSheet({ id, catCode, onClose, onEdit }: { id: string; catCode: Map<string, string | null>; onClose: () => void; onEdit: (e: ExpenseRow) => void }) {
  const router = useRouter();
  const [d, setD] = useState<ExpenseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    let live = true;
    getExpenseDetail(id).then((r) => { if (live) { if (r.ok) setD(r.detail); else setError(r.error); } });
    return () => { live = false; };
  }, [id]);
  const e = d?.expense;
  const ic = iconOf(e ? catCode.get(e.category_id) ?? null : null);
  const editable = e && (e.status === "draft" || e.status === "returned");

  async function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Failed");
    router.refresh(); onClose();
  }

  return (
    <Sheet title={e ? e.category_name : "Expense"} onClose={onClose}
      footer={editable ? (
        confirmDelete ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmDelete(false)} className="h-12 rounded-2xl bg-white font-semibold ring-1 ring-slate-300">Back</button>
            <button disabled={busy} onClick={() => run(() => deleteExpense(e!.id))} className="h-12 rounded-2xl bg-red-600 font-semibold text-white">{e!.status === "draft" ? "Delete draft" : "Withdraw"}</button>
          </div>
        ) : (
          <>
            {error && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800" role="alert">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onEdit(e!)} className="h-12 rounded-2xl bg-white font-semibold ring-1 ring-slate-300">{e!.status === "returned" ? "Correct" : "Edit"}</button>
              <button disabled={busy} onClick={() => run(() => submitExpense(e!.id))} className="h-12 rounded-2xl bg-rose-600 font-semibold text-white">{e!.status === "returned" ? "Resend as is" : "Submit"}</button>
            </div>
            <button onClick={() => setConfirmDelete(true)} className="mt-2 h-10 w-full text-sm font-medium text-red-700">{e!.status === "draft" ? "Delete draft" : "Withdraw this expense"}</button>
          </>
        )
      ) : undefined}>
      {!d && !error && <p className="py-8 text-center text-sm text-slate-500">Loading…</p>}
      {error && !d && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {e && d && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={cn("grid size-12 place-items-center rounded-2xl", ic.tone)}><ic.icon className="size-6" /></span>
            <div>
              <div className="tabular text-2xl font-bold">{inr(e.amount)}</div>
              <div className="text-xs text-slate-500">{e.expense_no ?? "Draft"} · {date(e.expense_date)}</div>
            </div>
            <span className="ml-auto"><StatusLine e={e} /></span>
          </div>
          {e.status === "rejected" && e.rejection_reason && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Rejected: {e.rejection_reason}</p>}
          {e.status === "returned" && e.rejection_reason && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Please correct: {e.rejection_reason}</p>}
          {e.status === "cancelled" && <p className="rounded-xl bg-slate-100 p-3 text-sm">Cancelled: {e.cancel_reason}</p>}
          {e.status === "approved" && e.paid_by === "employee" && (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Approved</div><div className="tabular font-semibold">{inr(e.approved_amount, { decimals: false })}</div></div>
              <div className="rounded-xl bg-emerald-50 p-2"><div className="text-[11px] text-slate-500">Paid to you</div><div className="tabular font-semibold">{inr(e.reimbursed_amount, { decimals: false })}</div></div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="text-[11px] text-slate-500">Still due</div><div className="tabular font-semibold">{inr(e.outstanding, { decimals: false })}</div></div>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">Route</dt><dd>{e.route_name ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Brand</dt><dd>{e.brand_name ?? "All brands"}</dd></div>
            <div><dt className="text-xs text-slate-500">Paid by</dt><dd>{e.paid_by === "company" ? "Company" : "You"}{e.payment_method ? ` · ${EXPENSE_PAYMENT_METHOD[e.payment_method]}` : ""}</dd></div>
            <div><dt className="text-xs text-slate-500">Entered by</dt><dd>{e.created_by === e.employee_id ? "You" : `${e.created_by_name} (office)`}</dd></div>
            {e.description && <div className="col-span-2"><dt className="text-xs text-slate-500">Note</dt><dd>{e.description}</dd></div>}
          </dl>
          {d.receiptUrl && <a href={d.receiptUrl} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-medium"><Receipt className="size-4" /> View bill</a>}
          {d.payments.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">Payments</div>
              <ul className="space-y-1 text-sm">
                {d.payments.map((x) => <li key={x.id} className={cn("flex justify-between", x.cancelled_at && "text-slate-400 line-through")}><span>{date(x.paid_on)} · {REIMBURSE_METHOD[x.method] ?? x.method}</span><span className="tabular font-medium">{inr(x.line_amount)}</span></li>)}
              </ul>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">History</div>
            <ol className="space-y-1.5 text-sm">
              {d.events.map((ev) => (
                <li key={ev.id}><span className="font-medium">{EVENT_LABEL[ev.action] ?? ev.action}</span> <span className="text-xs text-slate-500">· {ev.performer ?? "System"} · {dateTime(ev.created_at)}</span>{ev.remarks && <div className="text-xs text-slate-600">{ev.remarks}</div>}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Sheet>
  );
}
