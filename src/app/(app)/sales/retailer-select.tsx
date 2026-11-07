"use client";

import { forwardRef, useEffect, useState, useTransition } from "react";
import { History, MapPin, Pencil, Search, Store, UserPlus } from "lucide-react";
import { Alert, Badge, Button, Input, Label, Select, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { inr } from "@/lib/format";
import { GST_STATES } from "@/lib/states";
import { quickCreateRetailer, searchRetailers, updateRetailerBilling, type PickerRetailer } from "./actions";

const RECENT_KEY = "apex.recentRetailers";
const readRecent = (): PickerRetailer[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
};
export function rememberRetailer(r: PickerRetailer) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent().filter((x) => x.id !== r.id)].slice(0, 6))); } catch { /* private mode */ }
}

// Which legally required GST invoice details are missing for this shop (rule 46).
export function missingTaxDetails(r: PickerRetailer, invoiceTotal = 0) {
  const miss: string[] = [];
  const registered = !!r.gstin;
  if ((registered || invoiceTotal >= 50000) && !(r.billing_address ?? "").trim()) miss.push("billing address");
  if (registered && !(r.billing_pincode ?? "").trim()) miss.push("PIN code");
  return miss;
}

// Search by shop, owner, mobile, GSTIN or ID; recent shops; "+ Add New Retailer" without leaving the page.
export const RetailerSelect = forwardRef<HTMLInputElement, {
  value: PickerRetailer | null;
  onChange: (r: PickerRetailer | null) => void;
  canEditDetails?: boolean;
  companyState?: string;
}>(function RetailerSelect({ value, onChange, canEditDetails = false, companyState = "27" }, ref) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerRetailer[]>([]);
  const [recent, setRecent] = useState<PickerRetailer[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { setRecent(readRecent()); }, [value]);
  useEffect(() => {
    if (value) return;
    const t = setTimeout(async () => setResults(await searchRetailers(q)), 150);
    return () => clearTimeout(t);
  }, [q, value]);

  const pick = async (r: PickerRetailer, fresh = true) => {
    // Recent list is stored on the device: refresh balances before using it.
    let use = r;
    if (!fresh) use = (await searchRetailers(r.code)).find((x) => x.id === r.id) ?? r;
    rememberRetailer(use);
    onChange(use);
    setOpen(false);
    setQ("");
  };

  if (value) {
    const missing = missingTaxDetails(value);
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Store className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{value.shop_name} <span className="font-mono text-xs font-normal text-slate-500">{value.code}</span></div>
            <div className="text-sm text-slate-600">{[value.owner_name, value.mobile].filter(Boolean).join(" · ")}</div>
            <div className="flex items-start gap-1 text-xs text-slate-500">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              {[value.billing_address, value.billing_city, value.billing_pincode].filter(Boolean).join(", ") || "No address"} · {GST_STATES[value.billing_state_code] ?? value.billing_state_code}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone={value.gstin ? "blue" : "slate"}>{value.gstin ? `GSTIN ${value.gstin}` : "Unregistered (no GSTIN)"}</Badge>
              <Badge tone={value.overdue > 0 ? "red" : value.outstanding > 0 ? "amber" : "green"}>Outstanding {inr(value.outstanding, { decimals: false })}</Badge>
              {value.overdue > 0 && <Badge tone="red">Overdue {inr(value.overdue, { decimals: false })}</Badge>}
              {value.credit_limit > 0 && <Badge>Limit {inr(value.credit_limit, { decimals: false })}</Badge>}
              {value.status !== "active" && <Badge tone="red">Account {value.status.replace("_", " ")}</Badge>}
            </div>
            {missing.length > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-800">Needed on a GST invoice: {missing.join(", ")}.</p>
            )}
          </div>
          <div className="flex gap-2 sm:flex-col">
            <Button variant="secondary" size="sm" onClick={() => onChange(null)}>Change</Button>
            {canEditDetails && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Details</Button>
            )}
          </div>
        </div>
        {editing && <BillingDetailsDialog retailer={value} onClose={() => setEditing(false)} onSaved={(r) => { rememberRetailer(r); onChange(r); setEditing(false); }} />}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
          <Input ref={ref} id="retailer-search" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { e.preventDefault(); pick(results[0]); } if (e.key === "Escape") setOpen(false); }}
            placeholder="Search retailer: shop, owner, mobile or GSTIN" className="h-12 pl-10 text-base" autoComplete="off" />
        </div>
        <Button className="h-12 bg-violet-600 hover:bg-violet-700" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" /> <span className="hidden sm:inline">Add New Retailer</span>
        </Button>
      </div>
      {!open && recent.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <History className="size-3.5 text-slate-400" />
          {recent.map((r) => (
            <button key={r.id} type="button" onClick={() => pick(r, false)} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:border-violet-400 hover:bg-violet-50">
              {r.shop_name}
            </button>
          ))}
        </div>
      )}
      {open && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              No retailer found. <button className="font-semibold text-violet-700 underline" onClick={() => setCreating(true)}>+ Add New Retailer</button>
            </li>
          ) : results.map((r, i) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r)} className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-violet-50", i === 0 && q && "bg-slate-50")}>
                <span className="min-w-0">
                  <span className="font-medium">{r.shop_name}</span>{r.owner_name ? <span className="text-slate-500"> · {r.owner_name}</span> : null}
                  <span className="block truncate text-xs text-slate-500">{r.code} · {r.mobile}{r.billing_city ? ` · ${r.billing_city}` : ""}{r.gstin ? ` · ${r.gstin}` : ""}</span>
                </span>
                {r.overdue > 0 ? <Badge tone="red">Overdue</Badge> : r.outstanding > 0 ? <Badge tone="amber">{inr(r.outstanding, { decimals: false })}</Badge> : null}
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-3 py-1.5 text-right">
            <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setOpen(false)}>Close</button>
          </li>
        </ul>
      )}
      {creating && <QuickRetailerDialog initialName={/^[0-9]{10}$/.test(q.trim()) ? "" : q} initialMobile={/^[0-9]{10}$/.test(q.trim()) ? q.trim() : ""} companyState={companyState}
        onClose={() => setCreating(false)} onCreated={(r) => { rememberRetailer(r); onChange(r); setCreating(false); setOpen(false); }} />}
    </div>
  );
});

function QuickRetailerDialog({ initialName, initialMobile, companyState, onClose, onCreated }: { initialName: string; initialMobile: string; companyState: string; onClose: () => void; onCreated: (r: PickerRetailer) => void }) {
  const [form, setForm] = useState({ shop_name: initialName, mobile: initialMobile, owner_name: "", gstin: "", billing_address: "", billing_city: "", billing_pincode: "", billing_state_code: companyState });
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<{ code: string; shop_name: string; city: string | null }[] | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function save(force = false) {
    setError(null);
    start(async () => {
      const res = await quickCreateRetailer({ ...form, billing_pincode: form.billing_pincode || undefined, force });
      if (res.retailer) onCreated(res.retailer);
      else if (res.similar) setSimilar(res.similar);
      else setError(res.error ?? "Could not create the retailer");
    });
  }

  return (
    <Dialog title="Add new retailer" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="qr-shop">Retailer / shop name</Label><Input id="qr-shop" value={form.shop_name} onChange={set("shop_name")} autoFocus required /></div>
        <div className="sm:col-span-2"><Label htmlFor="qr-mobile">Mobile number</Label><Input id="qr-mobile" value={form.mobile} onChange={set("mobile")} inputMode="tel" maxLength={14} required /></div>
        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="text-left text-sm font-medium text-violet-700 hover:underline sm:col-span-2">+ GSTIN, address and contact person (optional — can be added later)</button>
        ) : (
          <>
            <div><Label htmlFor="qr-owner" hint="optional">Contact person</Label><Input id="qr-owner" value={form.owner_name} onChange={set("owner_name")} /></div>
            <div><Label htmlFor="qr-gstin" hint="optional">GSTIN</Label><Input id="qr-gstin" value={form.gstin} onChange={set("gstin")} maxLength={15} className="font-mono uppercase" /></div>
            <div className="sm:col-span-2"><Label htmlFor="qr-addr" hint="optional">Billing address</Label><Input id="qr-addr" value={form.billing_address} onChange={set("billing_address")} /></div>
            <div><Label htmlFor="qr-city" hint="optional">City</Label><Input id="qr-city" value={form.billing_city} onChange={set("billing_city")} /></div>
            <div><Label htmlFor="qr-pin" hint="optional">Pincode</Label><Input id="qr-pin" value={form.billing_pincode} onChange={set("billing_pincode")} inputMode="numeric" maxLength={6} /></div>
            <div className="sm:col-span-2">
              <Label htmlFor="qr-state" hint="taken from GSTIN when given">State</Label>
              <Select id="qr-state" value={form.billing_state_code} onChange={set("billing_state_code")}>
                {Object.entries(GST_STATES).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}
              </Select>
            </div>
          </>
        )}
        {similar && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
            <div className="font-semibold">Similar shops already exist:</div>
            <ul className="mt-1 list-disc pl-5">{similar.map((s) => <li key={s.code}>{s.shop_name} ({s.code}{s.city ? `, ${s.city}` : ""})</li>)}</ul>
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => save(true)} disabled={pending}>It&apos;s a different shop — add anyway</Button>
          </div>
        )}
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending} className="bg-violet-600 hover:bg-violet-700">{pending ? "Saving…" : "Save and select"}</Button>
        </div>
        <p className="text-xs text-slate-400 sm:col-span-2">Same mobile number or GSTIN as an existing shop is refused. Credit terms default to 15 days and can be changed later.</p>
      </form>
    </Dialog>
  );
}

// Fill in what a GST invoice needs (address, PIN, state, GSTIN) without leaving billing.
export function BillingDetailsDialog({ retailer, onClose, onSaved }: { retailer: PickerRetailer; onClose: () => void; onSaved: (r: PickerRetailer) => void }) {
  const [form, setForm] = useState({
    owner_name: retailer.owner_name ?? "", gstin: retailer.gstin ?? "", billing_address: retailer.billing_address ?? "",
    billing_city: retailer.billing_city ?? "", billing_pincode: retailer.billing_pincode ?? "", billing_state_code: retailer.billing_state_code,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v, ...(k === "gstin" && /^[0-9]{2}/.test(v) ? { billing_state_code: v.slice(0, 2) } : {}) }));
  };
  return (
    <Dialog title={`Billing details · ${retailer.shop_name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => { const r = await updateRetailerBilling(retailer.id, form); if (r.retailer) onSaved(r.retailer); else setError(r.error ?? "Could not save"); }); }} className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="bd-owner" hint="optional">Contact person</Label><Input id="bd-owner" value={form.owner_name} onChange={set("owner_name")} /></div>
        <div><Label htmlFor="bd-gstin" hint="blank = unregistered">GSTIN</Label><Input id="bd-gstin" value={form.gstin} onChange={set("gstin")} maxLength={15} className="font-mono uppercase" /></div>
        <div className="sm:col-span-2"><Label htmlFor="bd-addr">Billing address</Label><Input id="bd-addr" value={form.billing_address} onChange={set("billing_address")} required autoFocus /></div>
        <div><Label htmlFor="bd-city">City</Label><Input id="bd-city" value={form.billing_city} onChange={set("billing_city")} /></div>
        <div><Label htmlFor="bd-pin">Pincode</Label><Input id="bd-pin" value={form.billing_pincode} onChange={set("billing_pincode")} inputMode="numeric" maxLength={6} required /></div>
        <div className="sm:col-span-2">
          <Label htmlFor="bd-state">State (place of supply)</Label>
          <Select id="bd-state" value={form.billing_state_code} onChange={set("billing_state_code")}>
            {Object.entries(GST_STATES).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}
          </Select>
        </div>
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
