"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, XCircle } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { cancelQuotation, confirmOrder } from "../../actions";

export function OrderActions({ orderId, canConfirm, canOverride, canEdit }: { orderId: string; canConfirm: boolean; canOverride: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [override, setOverride] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <Button
            className="bg-accent-600 hover:bg-accent-700"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await confirmOrder(orderId, override);
                if (res.invoiceId) router.push(`/sales/invoices/${res.invoiceId}?new=1`);
                else setError({ message: res.error ?? "Could not confirm", hint: res.hint });
              })
            }
          >
            <Check className="size-4" /> {pending ? "Confirming…" : "Confirm invoice"}
          </Button>
        )}
        {canEdit && (
          <Link href={`/sales/orders/${orderId}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
            <Pencil className="size-4" /> Edit
          </Link>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const reason = prompt("Why is this quotation being cancelled?");
              if (reason === null) return;
              start(async () => {
                const res = await cancelQuotation(orderId, reason);
                if (res.error) setError({ message: res.error });
                else router.refresh();
              });
            }}
          >
            <XCircle className="size-4" /> Cancel quotation
          </Button>
        )}
      </div>
      {error && (
        <Alert>
          {error.message}
          {error.hint === "CREDIT_LIMIT" && canOverride && (
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="size-4" />
              Override credit limit and try again (recorded in the audit log)
            </label>
          )}
          {error.hint === "STOCK_SHORT" && <div className="mt-1">Edit the quotation to reduce quantities, or record stock in first.</div>}
        </Alert>
      )}
    </div>
  );
}
