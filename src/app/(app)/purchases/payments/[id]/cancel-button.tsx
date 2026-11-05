"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Alert, Button, Label, Textarea } from "@/components/ui";
import { Dialog } from "../../../sales/order-builder";
import { cancelSupplierPayment } from "../../actions";

export function CancelSupplierPaymentButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Ban className="size-4" /> Cancel payment</Button>
      {open && (
        <Dialog title="Cancel supplier payment" onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-slate-600">The bills it paid become payable again.</p>
          <Label htmlFor="r">Reason</Label>
          <Textarea id="r" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Keep</Button>
            <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => start(async () => {
              const res = await cancelSupplierPayment(id, reason);
              if (res.error) setError(res.error); else { setOpen(false); router.refresh(); }
            })}>{pending ? "Cancelling…" : "Cancel payment"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
