"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, CloudOff, FileText, IndianRupee, MapPin, Navigation, Phone, RefreshCw, ShoppingCart, Target, XCircle,
} from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { Dialog } from "../../sales/order-builder";
import { date, inr } from "@/lib/format";
import { VISIT_STATUS } from "@/lib/status";
import { fieldToday, saveVisit, type FieldDay, type FieldVisit, type VisitUpdate } from "../actions";
import { recordPayment } from "../../payments/actions";
import { setupServiceWorker } from "@/lib/sw";

// ---------------------------------------------------------------------------
// Offline support: today's route is cached on the phone; visit updates and
// payments made without network are queued and sent when the phone is back
// online. Every queued item has a one-time id, so a resend never duplicates.
// ---------------------------------------------------------------------------
const CACHE_KEY = "apex-field-day";
const QUEUE_KEY = "apex-field-queue";

type Queued =
  | { kind: "visit"; id: string; data: VisitUpdate }
  | { kind: "payment"; id: string; data: Parameters<typeof recordPayment>[0] & { shop: string } };

const load = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const store = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};

const REASONS = ["Shop closed", "Owner not available", "No order today", "Payment not ready", "Route time over", "Other"];

function getPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// mobile = shown inside the salesman app (/m): links stay inside that app.
export function FieldApp({ initial, mobile = false }: { initial: FieldDay | null; mobile?: boolean }) {
  const [day, setDay] = useState<FieldDay | null>(initial);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [paying, setPaying] = useState<FieldVisit | null>(null);
  const [closing, setClosing] = useState<{ v: FieldVisit; mode: "complete" | "missed" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // boot: cache / queue / service worker
  useEffect(() => {
    if (initial) store(CACHE_KEY, initial);
    else setDay(load<FieldDay | null>(CACHE_KEY, null));
    setQueue(load<Queued[]>(QUEUE_KEY, []));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setupServiceWorker();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [initial]);

  const persistQueue = (q: Queued[]) => {
    setQueue(q);
    store(QUEUE_KEY, q);
  };

  // Apply an update to the local copy so the screen reflects it immediately.
  const applyLocal = useCallback((u: VisitUpdate) => {
    setDay((d) => {
      if (!d) return d;
      const visits = d.visits.map((v) =>
        v.retailer_id !== u.retailerId
          ? v
          : {
              ...v,
              checkin_at: v.checkin_at ?? u.at,
              status: u.action === "complete" ? ("completed" as const) : u.action === "missed" ? ("missed" as const) : v.status,
              remarks: u.remarks ?? v.remarks,
              missed_reason: u.action === "missed" ? u.reason ?? null : v.missed_reason,
            }
      );
      const next = { ...d, visits };
      store(CACHE_KEY, next);
      return next;
    });
  }, []);

  const sync = useCallback(async () => {
    const q = load<Queued[]>(QUEUE_KEY, []);
    if (!q.length || !navigator.onLine) return;
    setSyncing(true);
    const left: Queued[] = [];
    for (const item of q) {
      try {
        const res = item.kind === "visit" ? await saveVisit(item.data) : await recordPayment(item.data);
        if ("error" in res && res.error) {
          // A business error (e.g. bad reference) won't fix itself; keep it visible.
          left.push(item);
          setNotice(`Could not send ${item.kind === "payment" ? `payment for ${item.data.shop}` : "a visit update"}: ${res.error}`);
        }
      } catch {
        left.push(item);
      }
    }
    persistQueue(left);
    setSyncing(false);
    if (!left.length) {
      try {
        const fresh = await fieldToday();
        setDay(fresh);
        store(CACHE_KEY, fresh);
      } catch {
        /* stay on cached data */
      }
    }
  }, []);

  useEffect(() => {
    if (online) sync();
  }, [online, sync]);

  async function send(item: Queued) {
    const q = [...load<Queued[]>(QUEUE_KEY, []), item];
    persistQueue(q);
    if (navigator.onLine) await sync();
  }

  async function visitAction(v: FieldVisit, action: VisitUpdate["action"], extra: { remarks?: string; reason?: string } = {}) {
    const pos = await getPosition();
    const u: VisitUpdate = {
      clientUuid: crypto.randomUUID(),
      visitId: v.visit_id,
      retailerId: v.retailer_id,
      action,
      remarks: extra.remarks,
      reason: extra.reason,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      accuracy: pos?.accuracy ?? null,
      at: new Date().toISOString(),
    };
    applyLocal(u);
    await send({ kind: "visit", id: u.clientUuid, data: u });
  }

  const visits = useMemo(() => (day?.visits ?? []).filter((v) => filter === "all" || v.status === "planned"), [day, filter]);
  const done = (day?.visits ?? []).filter((v) => v.status !== "planned").length;
  const total = day?.visits.length ?? 0;
  const dueToday = (day?.visits ?? []).reduce((t, v) => t + v.overdue, 0);

  if (!day) {
    return <Card className="p-8 text-center text-sm text-slate-500">No route data on this phone yet. Connect to the internet once to download today&apos;s route.</Card>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {(!online || queue.length > 0) && (
        <div className={cn("flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm", online ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900")}>
          <span className="flex items-center gap-2">
            <CloudOff className="size-4" />
            {online ? `${queue.length} update(s) waiting to send` : `Offline — ${queue.length} update(s) saved on this phone`}
          </span>
          {online && <Button size="sm" variant="secondary" onClick={sync} disabled={syncing}><RefreshCw className={cn("size-4", syncing && "animate-spin")} /> Send now</Button>}
        </div>
      )}
      {notice && <Alert>{notice}</Alert>}

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-ink-900 to-ink-700 p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">{date(day.date)}</div>
              <div className="text-lg font-semibold">{day.routeNames.length ? day.routeNames.join(" + ") : "No route planned"}</div>
            </div>
            <div className="text-right">
              <div className="tabular text-2xl font-semibold">{done}/{total}</div>
              <div className="text-xs text-slate-300">visits done</div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-accent-500" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
          <Mini label="Collected today" value={inr(day.collectedToday, { decimals: false })} tone="text-emerald-700" />
          <Mini label="Sold today" value={inr(day.soldToday, { decimals: false })} tone="text-sky-700" />
          <Mini label="Overdue on route" value={inr(dueToday, { decimals: false })} tone={dueToday > 0 ? "text-red-700" : "text-slate-400"} />
        </div>
        {day.target && !mobile && (
          <div className="space-y-2 border-t border-slate-100 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Target className="size-3.5" /> Target {day.target.period}</div>
            <Progress label="Sales" done={day.target.salesDone} goal={day.target.sales} />
            <Progress label="Collection" done={day.target.collectionDone} goal={day.target.collection} />
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setFilter("todo")} className={cn("rounded-full border px-3 py-1 text-sm", filter === "todo" ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white")}>To visit ({total - done})</button>
          <button onClick={() => setFilter("all")} className={cn("rounded-full border px-3 py-1 text-sm", filter === "all" ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white")}>All ({total})</button>
        </div>
        <span className="text-xs text-slate-400">Updated {new Date(day.loadedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {visits.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-500">
          {total === 0 ? "No visits planned for today. Ask your manager to plan your route." : "All visits done for today. 🎉"}
          {mobile && total === 0 && <div className="mt-3"><Link href="/m/outlets" className="font-semibold text-sky-700">See all my outlets →</Link></div>}
        </Card>
      )}

      {visits.map((v) => {
        const st = VISIT_STATUS[v.status];
        const mapQ = encodeURIComponent(`${v.shop_name} ${v.address}`);
        return (
          <Card key={v.retailer_id} className={cn("overflow-hidden", v.overdue > 0 && v.status === "planned" && "border-red-200")}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={mobile ? `/m/outlets/${v.retailer_id}` : `/retailers/${v.retailer_id}`} className="font-semibold hover:underline">{v.shop_name}</Link>
                  <div className="text-sm text-slate-500">{[v.owner_name, v.address].filter(Boolean).join(" · ")}</div>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Outstanding</div><div className="tabular text-sm font-semibold">{inr(v.outstanding, { decimals: false })}</div></div>
                <div className={cn("rounded-lg p-2", v.overdue > 0 ? "bg-red-50" : "bg-slate-50")}><div className="text-[11px] text-slate-500">Overdue</div><div className={cn("tabular text-sm font-semibold", v.overdue > 0 ? "text-red-700" : "text-slate-400")}>{inr(v.overdue, { decimals: false })}</div></div>
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Last paid</div><div className="text-xs font-medium">{v.last_payment ? `${inr(v.last_payment.amount, { decimals: false })} · ${date(v.last_payment.date)}` : "—"}</div></div>
              </div>

              {v.overdue_bills.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {v.overdue_bills.slice(0, 4).map((b) => (
                    <li key={b.invoice_no} className="flex justify-between text-red-800"><span className="font-mono">{b.invoice_no.split("/").pop()} · due {date(b.due_date)}</span><span className="tabular font-medium">{inr(b.balance, { decimals: false })} · {b.days}d</span></li>
                  ))}
                  {v.overdue_bills.length > 4 && <li className="text-slate-500">+ {v.overdue_bills.length - 4} more</li>}
                </ul>
              )}
              {v.promise && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Promised {inr(v.promise.amount, { decimals: false })} on {date(v.promise.date)}</p>}
              {(v.remarks || v.missed_reason) && <p className="mt-2 text-xs text-slate-500">Note: {v.missed_reason ?? v.remarks}</p>}
            </div>

            <div className="grid grid-cols-4 border-t border-slate-100 text-xs font-medium">
              <a href={`tel:${v.mobile}`} className="flex flex-col items-center gap-1 py-2.5 text-slate-700 hover:bg-slate-50"><Phone className="size-4" /> Call</a>
              <a href={`https://www.google.com/maps/search/?api=1&query=${mapQ}`} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 py-2.5 text-slate-700 hover:bg-slate-50"><Navigation className="size-4" /> Map</a>
              <Link href={mobile ? `/m/order?retailer=${v.retailer_id}` : `/sales/new?retailer=${v.retailer_id}`} className="flex flex-col items-center gap-1 py-2.5 font-semibold text-accent-600 hover:bg-orange-50"><ShoppingCart className="size-4" /> Order</Link>
              <a href={`/api/pdf/statement/${v.retailer_id}`} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 py-2.5 text-slate-700 hover:bg-slate-50"><FileText className="size-4" /> Statement</a>
            </div>

            {v.status === "planned" && (
              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
                {!v.checkin_at ? (
                  <Button variant="secondary" size="sm" onClick={() => visitAction(v, "checkin")}><MapPin className="size-4" /> Check in</Button>
                ) : (
                  <span className="flex items-center justify-center text-xs text-emerald-700"><MapPin className="mr-1 size-3.5" /> In {new Date(v.checkin_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPaying(v)}><IndianRupee className="size-4" /> Collect</Button>
                <div className="grid grid-cols-2 gap-1">
                  <Button size="sm" className="px-0" onClick={() => setClosing({ v, mode: "complete" })} aria-label="Visit done"><CheckCircle2 className="size-4" /></Button>
                  <Button size="sm" variant="secondary" className="px-0 text-red-700" onClick={() => setClosing({ v, mode: "missed" })} aria-label="Missed"><XCircle className="size-4" /></Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {paying && (
        <CollectDialog
          visit={paying}
          onClose={() => setPaying(null)}
          onSave={async (p) => {
            const id = crypto.randomUUID();
            await send({ kind: "payment", id, data: { ...p, retailerId: paying.retailer_id, visitId: paying.visit_id, clientUuid: id, shop: paying.shop_name } });
            setDay((d) => (d ? { ...d, collectedToday: d.collectedToday + p.amount } : d));
            setPaying(null);
          }}
        />
      )}
      {closing && (
        <CloseDialog
          visit={closing.v}
          mode={closing.mode}
          onClose={() => setClosing(null)}
          onSave={async (extra) => {
            await visitAction(closing.v, closing.mode, extra);
            setClosing(null);
          }}
        />
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cn("tabular text-sm font-semibold", tone)}>{value}</div>
    </div>
  );
}

function Progress({ label, done, goal }: { label: string; done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="tabular">{inr(done, { decimals: false })} / {inr(goal, { decimals: false })}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function CollectDialog({ visit, onClose, onSave }: { visit: FieldVisit; onClose: () => void; onSave: (p: { amount: number; method: "cash" | "upi" | "bank_transfer" | "cheque"; reference?: string; bank?: string; notes?: string }) => Promise<void> }) {
  const [amount, setAmount] = useState(visit.overdue > 0 ? String(visit.overdue) : "");
  const [method, setMethod] = useState<"cash" | "upi" | "bank_transfer" | "cheque">("cash");
  const [reference, setReference] = useState("");
  const [bank, setBank] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={`Collect from ${visit.shop_name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">Outstanding {inr(visit.outstanding)} · overdue <span className="font-medium text-red-700">{inr(visit.overdue)}</span>. Applied to the oldest bills first.</p>
      <div className="space-y-3">
        <div><Label>Amount (₹)</Label><Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular h-12 text-lg font-semibold" autoFocus /></div>
        <div className="grid grid-cols-4 gap-1.5">
          {(["cash", "upi", "bank_transfer", "cheque"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} className={cn("rounded-lg border py-2 text-xs font-medium", method === m ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300")}>
              {m === "bank_transfer" ? "Bank" : m === "upi" ? "UPI" : m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        {method !== "cash" && <div><Label>{method === "cheque" ? "Cheque number" : "Reference / UTR"}</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
        {method === "cheque" && <div><Label>Bank</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} /></div>}
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={async () => {
          const amt = Number(amount);
          if (!(amt > 0)) return setError("Enter the amount.");
          if (method !== "cash" && !reference.trim()) return setError("Enter the reference number.");
          setBusy(true);
          await onSave({ amount: amt, method, reference, bank });
          setBusy(false);
        }}>{busy ? "Saving…" : `Save ${amount ? inr(Number(amount), { decimals: false }) : ""}`}</Button>
      </div>
      <p className="mt-3 text-xs text-slate-400">Works offline: saved on the phone and sent automatically when you are back online.</p>
    </Dialog>
  );
}

function CloseDialog({ visit, mode, onClose, onSave }: { visit: FieldVisit; mode: "complete" | "missed"; onClose: () => void; onSave: (x: { remarks?: string; reason?: string }) => Promise<void> }) {
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={mode === "complete" ? `Visit done — ${visit.shop_name}` : `Missed — ${visit.shop_name}`} onClose={onClose}>
      {mode === "missed" && (
        <div className="mb-3"><Label>Reason</Label><Select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select></div>
      )}
      <Label hint="optional">Remarks</Label>
      <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={mode === "complete" ? "e.g. Will order next week, wants new Type-C stock" : ""} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button className={mode === "complete" ? "bg-emerald-600 hover:bg-emerald-700" : ""} variant={mode === "missed" ? "danger" : "primary"} disabled={busy}
          onClick={async () => { setBusy(true); await onSave(mode === "missed" ? { reason, remarks } : { remarks }); setBusy(false); }}>
          {mode === "complete" ? "Mark visited" : "Mark missed"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-400">Your location is saved with the visit (if you allow it).</p>
    </Dialog>
  );
}
