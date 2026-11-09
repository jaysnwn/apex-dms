"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CornerUpLeft, Paperclip, Pencil, Send, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Textarea, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { date, dateTime, inr } from "@/lib/format";
import {
  EVENT_LABEL, EXPENSE_PAYMENT_METHOD, EXPENSE_STATUS, REIMBURSE_METHOD, REIMBURSEMENT_STATUS,
  expensePermissions, type ExpenseDetail, type ExpenseRow,
} from "@/lib/expense-labels";
import { cancelExpense, deleteExpense, getExpenseDetail, reviewExpenses, submitExpense } from "./actions";
import { ExpenseForm, type FormOptions } from "./expense-form";

type Me = { id: string; name: string; role: string };

export function StatusBadges({ e }: { e: Pick<ExpenseRow, "status" | "reimbursement_status"> }) {
  const st = EXPENSE_STATUS[e.status];
  const rs = e.reimbursement_status ? REIMBURSEMENT_STATUS[e.reimbursement_status] : null;
  return (
    <span className="flex flex-wrap gap-1 whitespace-nowrap">
      {e.status !== "approved" || !rs ? <Badge tone={st.tone}>{st.label}</Badge> : null}
      {e.status === "approved" && rs && <Badge tone={e.reimbursement_status === "not_applicable" ? "blue" : rs.tone}>{e.reimbursement_status === "not_applicable" ? "Approved" : rs.label}</Badge>}
    </span>
  );
}

export function ExpenseTable({ rows, me, office, options, selectable, showEmployee, empty }: {
  rows: ExpenseRow[];
  me: Me;
  office: boolean;
  options: FormOptions;
  selectable?: boolean;
  showEmployee?: boolean;
  empty: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const reviewable = rows.filter((r) => expensePermissions(r, me).review);
  const chosen = rows.filter((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      {selectable && chosen.length > 0 && <BulkBar rows={chosen} onDone={() => setSel(new Set())} />}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              {selectable && (
                <th className="w-10 pl-4">
                  <input type="checkbox" aria-label="Select all" className="size-4 accent-ink-900"
                    checked={reviewable.length > 0 && reviewable.every((r) => sel.has(r.id))}
                    onChange={(e) => setSel(e.target.checked ? new Set(reviewable.map((r) => r.id)) : new Set())} />
                </th>
              )}
              <th className="px-4 py-2.5">Date</th>
              {showEmployee && <th className="px-3 py-2.5">Employee · entered by</th>}
              <th className="px-3 py-2.5">Category · description</th>
              <th className="px-3 py-2.5">Route · brand</th>
              <th className="px-3 py-2.5 text-right">Amount · paid by</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">{empty}</td></tr>}
            {rows.map((r) => {
              const canReview = expensePermissions(r, me).review;
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(r.id)}>
                  {selectable && (
                    <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="size-4 accent-ink-900" disabled={!canReview} checked={sel.has(r.id)} onChange={() => toggle(r.id)}
                        aria-label={`Select ${r.expense_no}`} title={canReview ? undefined : "You cannot approve your own expense"} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {date(r.expense_date)}
                    <div className="text-[11px] text-slate-400">{r.expense_no ?? "Draft"}</div>
                  </td>
                  {showEmployee && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium">{r.employee_name}</span>
                      <div className="text-[11px] text-slate-500">{r.created_by === r.employee_id ? (r.source === "salesman_app" ? "self · salesman app" : "self · office") : `by ${r.created_by_name ?? "office"} · office`}</div>
                    </td>
                  )}
                  <td className="max-w-60 px-3 py-2.5">
                    <span className="font-medium">{r.category_name}</span>
                    {r.receipt_path ? <Paperclip className="ml-1 inline size-3.5 text-emerald-600" aria-label="Has receipt" /> : <span className="ml-1 text-[11px] text-slate-400">no receipt</span>}
                    {r.possible_duplicate && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700"><AlertTriangle className="size-3" /> possible duplicate</span>}
                    <div className="truncate text-xs text-slate-500">{r.description ?? "—"}</div>
                    {(r.status === "rejected" || r.status === "returned") && r.rejection_reason && <div className="truncate text-xs text-red-700">{r.rejection_reason}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    <div>{r.route_name ?? "—"}</div>
                    <div className="text-slate-400">{r.brand_name ?? "All brands"}</div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                    <span className="font-medium">{inr(r.amount)}</span>
                    {r.approved_amount !== null && Number(r.approved_amount) !== Number(r.amount) && <div className="text-[11px] text-slate-500">approved {inr(r.approved_amount)}</div>}
                    {Number(r.outstanding) > 0 && Number(r.reimbursed_amount) > 0 && <div className="text-[11px] text-violet-700">due {inr(r.outstanding)}</div>}
                    <div className="text-[11px] text-slate-500">{r.paid_by === "company" ? "Company" : "Employee"}{r.payment_method ? ` · ${EXPENSE_PAYMENT_METHOD[r.payment_method]}` : ""}</div>
                  </td>
                  <td className="px-4 py-2.5"><StatusBadges e={r} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {open && <ExpenseDetailDialog id={open} me={me} office={office} options={options} onClose={() => setOpen(null)} />}
    </>
  );
}

function BulkBar({ rows, onDone }: { rows: ExpenseRow[]; onDone: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "approve" | "reject" | "return">(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);
  const run = () => start(async () => {
    setError(null);
    const res = await reviewExpenses({ ids: rows.map((r) => r.id), decision: mode!, reason });
    if (!res.ok) return setError(res.error);
    setMode(null); setReason(""); onDone(); router.refresh();
  });
  return (
    <div className="sticky top-2 z-10 mb-3 rounded-xl bg-ink-900 p-3 text-white shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm"><b>{rows.length}</b> selected · <b className="tabular">{inr(total)}</b></span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setMode("approve")}><Check className="size-4" /> Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("return")}><CornerUpLeft className="size-4" /> Return</Button>
          <Button size="sm" variant="secondary" className="text-red-700" onClick={() => setMode("reject")}><X className="size-4" /> Reject</Button>
        </div>
      </div>
      {mode && (
        <div className="mt-3 rounded-lg bg-white p-3 text-slate-900">
          {mode === "approve"
            ? <p className="text-sm">Approve <b>{rows.length}</b> expense{rows.length > 1 ? "s" : ""} for <b>{inr(total)}</b>? Each one is recorded separately in its history.</p>
            : <><Label>{mode === "reject" ? "Reason for rejection" : "What must be corrected?"}</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></>}
          {error && <div className="mt-2"><Alert>{error}</Alert></div>}
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setMode(null); setError(null); }}>Back</Button>
            <Button size="sm" disabled={pending || (mode !== "approve" && !reason.trim())} onClick={run}>{pending ? "Saving…" : mode === "approve" ? `Yes, approve ${inr(total)}` : mode === "reject" ? "Reject" : "Return for correction"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) {
  return <div className={cn(wide && "col-span-2")}><div className="text-xs text-slate-500">{k}</div><div className="text-sm font-medium break-words">{v || "—"}</div></div>;
}

export function ExpenseDetailDialog({ id, me, office, options, onClose }: { id: string; me: Me; office: boolean; options: FormOptions; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<ExpenseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<null | "approve" | "reject" | "return" | "cancel" | "delete" | "edit">(null);
  const [reason, setReason] = useState("");
  const [approveAmt, setApproveAmt] = useState("");
  const [pending, start] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    getExpenseDetail(id).then((r) => {
      if (!live) return;
      if (r.ok) { setD(r.detail); setApproveAmt(String(r.detail.expense.amount)); } else setError(r.error);
    });
    return () => { live = false; };
  }, [id, reload]);

  const e = d?.expense;
  const can = useMemo(() => (e ? expensePermissions(e, me) : null), [e, me]);
  const isImage = e?.receipt_path ? /\.(jpe?g|png|webp|gif|heic)$/i.test(e.receipt_path) : false;

  function act(fn: () => Promise<{ ok?: boolean; error?: string }>, close = false) {
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Failed");
      setStep(null); setReason("");
      router.refresh();
      if (close) onClose(); else setReload((x) => x + 1);
    });
  }

  return (
    <Dialog title={e ? `${e.category_name} · ${inr(e.amount)}` : "Expense"} onClose={onClose} wide>
      {!d && !error && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {error && !d && <Alert>{error}</Alert>}
      {e && step === "edit" && (
        <div>
          <ExpenseForm me={me} office={office} options={options} initial={e} compact onDone={() => { setStep(null); setReload((x) => x + 1); }} />
          <div className="mt-3"><Button variant="secondary" onClick={() => setStep(null)}>Back</Button></div>
        </div>
      )}
      {e && d && step !== "edit" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{e.expense_no ?? "Draft"}</span>
              <StatusBadges e={e} />
              {e.possible_duplicate && <Badge tone="amber">Possible duplicate: same person, date, category and amount</Badge>}
            </div>
            {(e.status === "rejected" || e.status === "returned") && e.rejection_reason && (
              <Alert tone={e.status === "returned" ? "amber" : "red"}>{e.status === "returned" ? "To correct: " : "Rejected: "}{e.rejection_reason}</Alert>
            )}
            {e.status === "cancelled" && <Alert tone="amber">Cancelled: {e.cancel_reason}</Alert>}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <Field k="Employee" v={e.employee_name} />
              <Field k="Date" v={date(e.expense_date)} />
              <Field k="Category" v={e.category_name} />
              <Field k="Claimed" v={inr(e.amount)} />
              <Field k="Approved" v={e.approved_amount !== null ? inr(e.approved_amount) : null} />
              <Field k="Paid by" v={e.paid_by === "company" ? "Company" : "Employee"} />
              {e.paid_by === "employee" && e.status === "approved" && <Field k="Reimbursed" v={inr(e.reimbursed_amount)} />}
              {e.paid_by === "employee" && e.status === "approved" && <Field k="Still to pay" v={inr(e.outstanding)} />}
              <Field k="Payment method" v={e.payment_method ? EXPENSE_PAYMENT_METHOD[e.payment_method] : null} />
              <Field k="Route" v={e.route_name} />
              <Field k="Brand" v={e.brand_name ?? "All brands"} />
              <Field k="Entered by" v={`${e.created_by === e.employee_id ? "Self" : e.created_by_name} · ${e.source === "salesman_app" ? "salesman app" : "office"}`} />
              <Field k="Description" v={e.description} wide />
              {office && e.notes && <Field k="Internal notes" v={e.notes} wide />}
              {e.reviewed_by_name && <Field k={e.status === "approved" ? "Approved by" : "Reviewed by"} v={`${e.reviewed_by_name} · ${dateTime(e.reviewed_at)}`} wide />}
            </div>

            {can && step === null && (
              <div className="flex flex-wrap gap-2">
                {can.review && <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStep("approve")}><Check className="size-4" /> Approve</Button>}
                {can.review && <Button variant="secondary" onClick={() => setStep("return")}><CornerUpLeft className="size-4" /> Return for correction</Button>}
                {can.review && <Button variant="secondary" className="text-red-700" onClick={() => setStep("reject")}><X className="size-4" /> Reject</Button>}
                {can.edit && <Button variant="secondary" onClick={() => setStep("edit")}><Pencil className="size-4" /> Edit</Button>}
                {can.submit && <Button onClick={() => act(() => submitExpense(e.id))} disabled={pending}><Send className="size-4" /> Submit for approval</Button>}
                {can.remove && <Button variant="secondary" className="text-red-700" onClick={() => setStep("delete")}><Trash2 className="size-4" /> {e.status === "draft" ? "Delete draft" : "Withdraw"}</Button>}
                {can.cancel && office && <Button variant="secondary" className="text-red-700" onClick={() => setStep("cancel")}>Cancel expense</Button>}
              </div>
            )}

            {step && (
              <div className="rounded-xl border border-slate-200 p-4">
                {step === "approve" && (
                  <>
                    <p className="mb-3 text-sm">Approve this expense for <b>{e.employee_name}</b>{e.paid_by === "employee" ? "; the approved amount becomes payable to them." : " (company paid — nothing to reimburse)."}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label hint={`claimed ${inr(e.amount)}`}>Approved amount (₹)</Label><Input type="number" min={0.01} max={e.amount} step="0.01" value={approveAmt} onChange={(x) => setApproveAmt(x.target.value)} /></div>
                      {Number(approveAmt) < Number(e.amount) && <div><Label>Why less than claimed?</Label><Input value={reason} onChange={(x) => setReason(x.target.value)} /></div>}
                    </div>
                  </>
                )}
                {(step === "reject" || step === "return" || step === "cancel") && (
                  <>
                    <Label>{step === "reject" ? "Reason for rejection (the employee will see it)" : step === "return" ? "What must be corrected? (the employee will see it)" : "Reason for cancelling"}</Label>
                    <Textarea rows={2} value={reason} onChange={(x) => setReason(x.target.value)} autoFocus />
                    {step === "cancel" && e.status === "approved" && <p className="mt-1 text-xs text-slate-500">The accounting entry is reversed; the record stays for the audit.</p>}
                  </>
                )}
                {step === "delete" && <p className="text-sm">{e.status === "draft" ? "Delete this draft? It was never submitted." : "Withdraw this expense? It keeps its number and history and is marked cancelled."}</p>}
                {error && <div className="mt-3"><Alert>{error}</Alert></div>}
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setStep(null); setError(null); setReason(""); }}>Back</Button>
                  <Button disabled={pending || ((step === "reject" || step === "return" || step === "cancel") && !reason.trim())}
                    className={step === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : step === "reject" || step === "cancel" || step === "delete" ? "bg-red-600 hover:bg-red-700" : undefined}
                    onClick={() => {
                      if (step === "approve") {
                        const a = Number(approveAmt);
                        return act(() => reviewExpenses({ ids: [e.id], decision: "approve", reason, amounts: a !== Number(e.amount) ? { [e.id]: a } : undefined }));
                      }
                      if (step === "reject" || step === "return") return act(() => reviewExpenses({ ids: [e.id], decision: step, reason }));
                      if (step === "cancel") return act(() => cancelExpense(e.id, reason));
                      if (step === "delete") return act(() => deleteExpense(e.id), e.status === "draft");
                    }}>
                    {pending ? "Saving…" : step === "approve" ? `Yes, approve ${inr(Number(approveAmt) || 0)}` : step === "reject" ? "Reject" : step === "return" ? "Return" : step === "cancel" ? "Cancel expense" : e.status === "draft" ? "Delete" : "Withdraw"}
                  </Button>
                </div>
              </div>
            )}
            {error && !step && <Alert>{error}</Alert>}

            {d.payments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Payments to the employee</h3>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                  {d.payments.map((p) => (
                    <li key={p.id} className={cn("flex items-center justify-between gap-3 px-3 py-2", p.cancelled_at && "text-slate-400 line-through")}>
                      <span>{date(p.paid_on)} · {p.reimbursement_no} · {REIMBURSE_METHOD[p.method] ?? p.method}{p.reference_no ? ` · ${p.reference_no}` : ""}{p.proof_url && <> · <a href={p.proof_url} target="_blank" rel="noopener" className="text-accent-700 hover:underline">proof</a></>}</span>
                      <span className="tabular font-medium">{inr(p.line_amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">History</h3>
              <ol className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
                {d.events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-slate-400" />
                    <span className="font-medium">{EVENT_LABEL[ev.action] ?? ev.action}</span>
                    {ev.amount !== null && ["approved", "reimbursed", "reimbursement_cancelled"].includes(ev.action) && <span className="tabular"> · {inr(ev.amount)}</span>}
                    <span className="text-slate-500"> · {ev.performer ?? "System"} · {dateTime(ev.created_at)}</span>
                    {ev.remarks && <div className="text-xs text-slate-600">{ev.remarks}</div>}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Receipt</div>
            {d.receiptUrl ? (
              isImage ? (
                <a href={d.receiptUrl} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.receiptUrl} alt="Receipt" className="max-h-[420px] w-full object-contain" />
                </a>
              ) : (
                <a href={d.receiptUrl} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm text-accent-700 hover:bg-slate-50"><Paperclip className="size-4" /> Open the receipt (PDF)</a>
              )
            ) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No receipt attached</div>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
