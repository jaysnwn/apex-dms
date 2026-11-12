"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, X } from "lucide-react";
import { Alert, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { createClient, tenantStoragePath } from "@/lib/supabase/client";
import { todayIST } from "@/lib/gst";
import { EXPENSE_PAYMENT_METHOD, type ExpenseCategory, type ExpenseRow } from "@/lib/expense-labels";
import { saveExpense } from "./actions";
import { shrinkImage } from "@/lib/image";

export type FormOptions = {
  categories: ExpenseCategory[];
  employees: { id: string; full_name: string; role: string }[];
  routes: { id: string; name: string; default_salesman_id: string | null; is_active: boolean }[];
  brands: { id: string; name: string; code: string }[];
};

const MAX_FILE = 10 * 1024 * 1024;

export async function uploadReceipt(userId: string, original: File, prefix = "") {
  if (!/^image\/|^application\/pdf$/.test(original.type)) throw new Error("Upload a photo or a PDF");
  const file = await shrinkImage(original);
  if (file.size > MAX_FILE) throw new Error("The file is larger than 10 MB");
  const path = tenantStoragePath(`${userId}/${prefix}${crypto.randomUUID()}-${file.name.replace(/[^\w.]+/g, "_").slice(-60)}`);
  const { error } = await createClient().storage.from("expense-receipts").upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export function ExpenseForm({ me, office, options, initial, onDone, compact }: {
  me: { id: string; name: string };
  office: boolean;
  options: FormOptions;
  initial?: ExpenseRow;
  onDone?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const editing = !!initial;
  const active = options.categories.filter((c) => c.is_active || c.id === initial?.category_id);
  const routeOf = (emp: string) => options.routes.find((r) => r.is_active && r.default_salesman_id === emp)?.id ?? "";

  const [employee, setEmployee] = useState(initial?.employee_id ?? me.id);
  const [category, setCategory] = useState(initial?.category_id ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [day, setDay] = useState(initial?.expense_date ?? todayIST());
  const [route, setRoute] = useState(initial ? initial.route_id ?? "" : routeOf(me.id));
  const [brand, setBrand] = useState(initial?.brand_id ?? "");
  const [method, setMethod] = useState(initial?.payment_method ?? "cash");
  const [paidBy, setPaidBy] = useState<"employee" | "company">(initial?.paid_by ?? "employee");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [keepReceipt, setKeepReceipt] = useState(!!initial?.receipt_path);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const clientUuid = useRef<string>(crypto.randomUUID());

  const cat = useMemo(() => active.find((c) => c.id === category), [active, category]);
  const empName = options.employees.find((e) => e.id === employee)?.full_name ?? me.name;

  function reset() {
    setAmount(""); setDescription(""); setNotes(""); setFile(null); setCategory(""); setKeepReceipt(false);
    clientUuid.current = crypto.randomUUID();
  }

  function save(submit: boolean) {
    start(async () => {
      setMsg({});
      const amt = Number(amount);
      if (!category) return setMsg({ error: "Choose the category" });
      if (!(amt > 0)) return setMsg({ error: "Enter an amount above zero" });
      if (submit && cat?.route_required && !route) return setMsg({ error: `Choose the route for ${cat.name}` });
      if (submit && cat?.receipt_required && !file && !keepReceipt) return setMsg({ error: `A receipt is required for ${cat.name}` });
      let receiptPath: string | null = keepReceipt ? initial?.receipt_path ?? null : null;
      if (file) {
        try { receiptPath = await uploadReceipt(me.id, file); } catch (e) { return setMsg({ error: (e as Error).message }); }
      }
      const res = await saveExpense({
        id: initial?.id ?? null,
        employeeId: employee,
        categoryId: category,
        amount: amt,
        date: day,
        routeId: route || null,
        brandId: brand || null,
        description,
        paymentMethod: (method || null) as "cash" | null,
        paidBy,
        receiptPath,
        notes,
        submit,
        clientUuid: editing ? null : clientUuid.current,
        source: "office",
      });
      if (!res.ok) return setMsg({ error: res.error });
      const what = res.status === "approved" ? "approved automatically" : res.status === "submitted" ? "sent for approval" : "saved as draft";
      setMsg({ ok: `${res.expenseNo ?? "Expense"} ${what}${employee !== me.id ? ` for ${empName}` : ""}.` });
      if (!editing) reset();
      router.refresh();
      onDone?.();
    });
  }

  const body = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {office && (
          <div className="sm:col-span-2">
            <Label hint="who spent the money">Employee</Label>
            <Select value={employee} onChange={(e) => { setEmployee(e.target.value); if (!editing) setRoute(routeOf(e.target.value)); }}>
              {options.employees.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.id === me.id ? " (me)" : ""} · {p.role.replace("_", " ")}</option>)}
            </Select>
          </div>
        )}
        <div>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} required>
            <option value="">Choose…</option>
            {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div><Label>Amount (₹)</Label><Input type="number" min={0.01} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
        <div><Label>Date</Label><Input type="date" value={day} max={todayIST()} onChange={(e) => setDay(e.target.value)} /></div>
        <div>
          <Label hint={cat?.route_required ? "required" : "optional"}>Route</Label>
          <Select value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="">—</option>
            {options.routes.filter((r) => r.is_active || r.id === route).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Brand</Label>
          <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Payment method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(EXPENSE_PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Paid by</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["employee", "company"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPaidBy(p)}
                className={cn("rounded-lg border px-3 py-2 text-left text-sm", paidBy === p ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 hover:border-slate-400")}>
                <span className="font-medium">{p === "employee" ? "Employee" : "Company"}</span>
                <span className={cn("block text-xs", paidBy === p ? "text-slate-300" : "text-slate-500")}>{p === "employee" ? "to be reimbursed" : "nothing to reimburse"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2"><Label hint="optional">Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Petrol, city route" maxLength={500} /></div>
        <div className="sm:col-span-2">
          <Label hint={cat?.receipt_required ? "required for this category" : "photo or PDF"}>Receipt</Label>
          {keepReceipt && !file ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              <FileText className="size-4" /> Current receipt kept
              <button type="button" onClick={() => setKeepReceipt(false)} className="ml-auto rounded p-1 hover:bg-emerald-100" aria-label="Remove receipt"><X className="size-4" /></button>
            </div>
          ) : (
            <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm hover:border-slate-400", file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : cat?.receipt_required ? "border-amber-400 text-slate-700" : "border-slate-300 text-slate-600")}>
              <Camera className="size-4" /> {file ? file.name : "Take or choose a photo / PDF"}
              <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
        {office && <div className="sm:col-span-2"><Label hint="office only — the employee does not see this">Internal notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></div>}
      </div>
      {msg.error && <div className="mt-3"><Alert>{msg.error}</Alert></div>}
      {msg.ok && <div className="mt-3"><Alert tone="green">{msg.ok}</Alert></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {(!editing || initial?.status === "draft" || initial?.status === "returned") && (
          <Button disabled={pending} onClick={() => save(true)}>{pending ? "Saving…" : editing && initial?.status === "returned" ? "Resubmit" : "Submit expense"}</Button>
        )}
        {editing && initial?.status === "submitted" && <Button disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save changes"}</Button>}
        {(!editing || initial?.status === "draft") && <Button variant="secondary" disabled={pending} onClick={() => save(false)}>Save as draft</Button>}
      </div>
    </>
  );

  if (compact) return body;
  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">Add an expense</h2>
      <p className="mb-4 text-xs text-slate-500">{office ? "For yourself, a salesman or another employee." : "It goes to your manager for approval."}</p>
      {body}
    </Card>
  );
}
