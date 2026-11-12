"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ClipboardList, PackageCheck, Truck } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { createClient, tenantStoragePath } from "@/lib/supabase/client";
import { date, dateTime, inr, qty } from "@/lib/format";
import { confirmDelivery, dispatchInvoice } from "./actions";
import { shrinkImage } from "@/lib/image";

export type PendingInvoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  grand_total: number;
  shop_name: string;
  city: string | null;
  mobile: string;
  brand_id: string;
  brand_name: string;
  items: { product_name: string; qty: number; unit_code: string; shortIn: Record<string, boolean> }[];
};
export type DispatchedRow = {
  id: string;
  dispatch_no: string;
  invoice_id: string;
  invoice_no: string;
  shop_name: string;
  city: string | null;
  vehicle_no: string | null;
  dispatched_at: string;
  delivered_at: string | null;
  status: string;
  remarks: string | null;
  warehouse: string;
};

export function DispatchBoard({
  tab,
  pending,
  dispatched,
  warehouses,
  canDispatch,
}: {
  tab: "pending" | "transit" | "history";
  pending: PendingInvoice[];
  dispatched: DispatchedRow[];
  warehouses: { id: string; name: string; brand_id: string }[];
  canDispatch: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [warehouse, setWarehouse] = useState(warehouses[0]?.id ?? "");
  const [dispatching, setDispatching] = useState<PendingInvoice | null>(null);
  // Goods leave a warehouse of the invoice's own brand: the picked one if it matches, else that brand's first.
  const whFor = (inv: PendingInvoice) => warehouses.find((w) => w.id === warehouse && w.brand_id === inv.brand_id) ?? warehouses.find((w) => w.brand_id === inv.brand_id);
  const [delivering, setDelivering] = useState<DispatchedRow | null>(null);

  if (tab === "pending") {
    return (
      <>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <Label htmlFor="wh">Dispatch from</Label>
            <Select id="wh" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="sm:w-64">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <a
            href={selected.length ? `/api/pdf/picking/${selected.join(",")}?warehouse=${warehouse}` : undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={!selected.length}
            className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium", selected.length ? "border-slate-300 bg-white hover:bg-slate-50" : "pointer-events-none border-slate-200 text-slate-400")}
          >
            <ClipboardList className="size-4" /> Picking list ({selected.length})
          </a>
          <a
            href={selected.length ? `/api/pdf/delivery-note/${selected.join(",")}` : undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={!selected.length}
            className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium", selected.length ? "border-slate-300 bg-white hover:bg-slate-50" : "pointer-events-none border-slate-200 text-slate-400")}
          >
            <Truck className="size-4" /> Delivery notes ({selected.length})
          </a>
          {pending.length > 0 && (
            <button className="text-sm text-accent-700 hover:underline" onClick={() => setSelected(selected.length === pending.length ? [] : pending.map((p) => p.id))}>
              {selected.length === pending.length ? "Clear selection" : "Select all"}
            </button>
          )}
        </div>

        {pending.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">Nothing waiting for dispatch. 🎉</Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pending.map((p) => {
              const wh = whFor(p);
              const shortHere = !wh || p.items.some((i) => i.shortIn[wh.id]);
              const waitDays = Math.floor((Date.now() - new Date(p.invoice_date).getTime()) / 864e5);
              return (
                <Card key={p.id} className={cn("p-4", selected.includes(p.id) && "border-accent-500 ring-2 ring-accent-500/20")}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 size-4" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} aria-label={`Select ${p.invoice_no}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{p.shop_name}</span>
                        <Badge tone={waitDays >= 2 ? "red" : waitDays >= 1 ? "amber" : "blue"}>{waitDays === 0 ? "Invoiced today" : `Waiting ${waitDays}d`}</Badge>
                      </div>
                      <div className="text-sm text-slate-500">
                        <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{p.brand_name}</span>
                        <Link href={`/sales/invoices/${p.id}`} className="font-mono hover:underline">{p.invoice_no}</Link> · {p.city ?? ""} · {inr(p.grand_total, { decimals: false })}
                        {wh && wh.id !== warehouse && <span className="block text-xs text-slate-400">from {wh.name}</span>}
                      </div>
                      <ul className="mt-2 space-y-0.5 text-sm">
                        {p.items.map((i, k) => (
                          <li key={k} className={cn("flex justify-between", wh && i.shortIn[wh.id] && "text-red-700")}>
                            <span className="truncate">{i.product_name}</span>
                            <span className="tabular shrink-0 font-medium">{qty(i.qty)} {i.unit_code.toLowerCase()}</span>
                          </li>
                        ))}
                      </ul>
                      {shortHere && <p className="mt-2 text-xs font-medium text-red-700">{wh ? "Not enough stock in this warehouse for the red items. Transfer stock or choose another warehouse." : `No active ${p.brand_name} warehouse.`}</p>}
                      {canDispatch && (
                        <Button size="sm" className="mt-3 bg-teal-600 hover:bg-teal-700" disabled={shortHere} onClick={() => setDispatching(p)}>
                          <Truck className="size-4" /> Dispatch full order
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {dispatching && whFor(dispatching) && <DispatchDialog invoice={dispatching} warehouseId={whFor(dispatching)!.id} warehouseName={whFor(dispatching)!.name} onClose={() => setDispatching(null)} />}
      </>
    );
  }

  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Dispatch</th><th className="px-3 py-2.5">Retailer</th><th className="px-3 py-2.5">Dispatched</th>
              <th className="px-3 py-2.5">{tab === "history" ? "Delivered" : "Status"}</th><th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dispatched.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Nothing here.</td></tr>}
            {dispatched.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2.5"><div className="font-mono text-xs">{d.dispatch_no}</div><Link href={`/sales/invoices/${d.invoice_id}`} className="font-mono text-xs text-slate-500 hover:underline">{d.invoice_no}</Link></td>
                <td className="px-3 py-2.5">{d.shop_name}<div className="text-xs text-slate-500">{d.city}</div></td>
                <td className="px-3 py-2.5 whitespace-nowrap">{dateTime(d.dispatched_at)}<div className="text-xs text-slate-500">{d.warehouse}{d.vehicle_no ? ` · ${d.vehicle_no}` : ""}</div></td>
                <td className="px-3 py-2.5">
                  {d.status === "delivered" ? (<><Badge tone="green">Delivered</Badge><div className="text-xs text-slate-500">{dateTime(d.delivered_at)}</div></>) : <Badge tone="teal">On the way</Badge>}
                  {d.remarks && <div className="text-xs text-slate-500">{d.remarks}</div>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <a href={`/api/pdf/delivery-note/${d.invoice_id}`} target="_blank" rel="noopener" className="mr-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium hover:bg-slate-50" title="Delivery note">
                    <Truck className="size-3.5" /> Note
                  </a>
                  {d.status === "dispatched" && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDelivering(d)}><PackageCheck className="size-4" /> Delivered</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {delivering && <DeliveryDialog row={delivering} onClose={() => setDelivering(null)} />}
    </>
  );
}

function DispatchDialog({ invoice, warehouseId, warehouseName, onClose }: { invoice: PendingInvoice; warehouseId: string; warehouseName: string; onClose: () => void }) {
  const [vehicle, setVehicle] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog title={`Dispatch ${invoice.invoice_no}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        All {invoice.items.length} item(s) leave <span className="font-medium">{warehouseName}</span> now and stock is deducted. Partial dispatch is not allowed.
      </p>
      <div className="space-y-3">
        <div><Label hint="optional">Vehicle / courier</Label><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. MH17 AB 1234" className="uppercase" /></div>
        <div><Label hint="optional">Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button className="bg-teal-600 hover:bg-teal-700" disabled={pending} onClick={() => start(async () => {
          const res = await dispatchInvoice(invoice.id, warehouseId, vehicle, remarks);
          if (res.error) setError(res.error); else { onClose(); router.refresh(); }
        })}>{pending ? "Dispatching…" : "Confirm dispatch"}</Button>
      </div>
    </Dialog>
  );
}

function DeliveryDialog({ row, onClose }: { row: DispatchedRow; onClose: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog title={`Delivered to ${row.shop_name}?`} onClose={onClose}>
      <div className="space-y-3">
        <div><Label hint="optional">Delivery remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Received by owner" /></div>
        <div>
          <Label hint="optional">Photo / signed copy</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600 hover:border-slate-400">
            <Camera className="size-4" /> {file ? file.name : "Take or choose a photo"}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => start(async () => {
          let path: string | null = null;
          if (file) {
            path = tenantStoragePath(`${row.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.]+/g, "_")}`);
            const small = await shrinkImage(file);
            const { error: upErr } = await createClient().storage.from("delivery-proofs").upload(path, small, { contentType: small.type });
            if (upErr) { setError(`Photo upload failed: ${upErr.message}`); return; }
          }
          const res = await confirmDelivery(row.id, remarks, path);
          if (res.error) setError(res.error); else { onClose(); router.refresh(); }
        })}>{pending ? "Saving…" : "Confirm delivery"}</Button>
      </div>
      <p className="mt-3 text-xs text-slate-400">Dispatched {date(row.dispatched_at)} from {row.warehouse}.</p>
    </Dialog>
  );
}
