"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, PackageCheck } from "lucide-react";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { Dialog } from "../sales/order-builder";
import { addDays, todayIST } from "@/lib/gst";
import { date } from "@/lib/format";
import { cancelPurchase, receivePurchase } from "./actions";

export function ReceiveButton({ purchaseId, purchaseNo, creditDays, showCostOption, size = "md", onDone }: {
  purchaseId: string; purchaseNo: string; creditDays: number; showCostOption: boolean; size?: "sm" | "md"; onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(todayIST());
  const [recvDate, setRecvDate] = useState(todayIST());
  const [updateCost, setUpdateCost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    if (!billNo.trim()) return setError("Enter the supplier's bill number.");
    start(async () => {
      const res = await receivePurchase(purchaseId, { billNo, billDate, receivedDate: recvDate, updateCost });
      if (res.error) return setError(res.error);
      setOpen(false);
      if (onDone) onDone();
      router.refresh();
    });
  }

  return (
    <>
      <Button size={size} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
        <PackageCheck className="size-4" /> Receive goods
      </Button>
      {open && (
        <Dialog title={`Receive ${purchaseNo}`} onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-slate-600">Check the goods against the order. Saving adds every product on this order to stock.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="rb">Supplier bill / invoice number</Label><Input id="rb" value={billNo} onChange={(e) => setBillNo(e.target.value)} autoFocus /></div>
            <div><Label htmlFor="rbd">Bill date</Label><Input id="rbd" type="date" value={billDate} max={todayIST()} onChange={(e) => setBillDate(e.target.value)} /></div>
            <div><Label htmlFor="rrd">Received on</Label><Input id="rrd" type="date" value={recvDate} max={todayIST()} onChange={(e) => setRecvDate(e.target.value)} /></div>
          </div>
          {showCostOption && <p className="mt-2 text-xs text-slate-500">Payment due {date(addDays(billDate || todayIST(), creditDays))} ({creditDays} days)</p>}
          {showCostOption && (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="size-4" />
              Update product purchase costs to this order&apos;s costs
            </label>
          )}
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">If the supplier sent a different quantity, ask the office to edit the order before receiving.</p>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={save}>{pending ? "Saving…" : "Add to stock"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function CancelPurchaseButton({ purchaseId, received }: { purchaseId: string; received: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Ban className="size-4" /> Cancel</Button>
      {open && (
        <Dialog title={received ? "Cancel received purchase" : "Cancel purchase order"} onClose={() => setOpen(false)}>
          {received && <p className="mb-3 text-sm text-red-800">The quantities on this bill will be taken back out of stock. Only possible if that stock is still in the warehouse and no payments are applied.</p>}
          <Label htmlFor="cr">Reason</Label>
          <Textarea id="cr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Keep</Button>
            <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => start(async () => {
              const res = await cancelPurchase(purchaseId, reason);
              if (res.error) setError(res.error); else { setOpen(false); router.refresh(); }
            })}>{pending ? "Cancelling…" : "Cancel purchase"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
