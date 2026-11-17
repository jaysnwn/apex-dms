"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Pencil, XCircle } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { cancelQuotation } from "../../actions";

// Quotation page actions. "Create invoice" opens the invoice draft (step 2); the
// invoice itself is only issued there, with Confirm invoice.
export function OrderActions({ orderId, canInvoice, canEdit }: { orderId: string; canInvoice: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canInvoice && (
          <Link href={`/sales/orders/${orderId}?step=invoice`} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-medium text-on-fill hover:bg-primary-hover">
            <FileText className="size-4" /> Create invoice
          </Link>
        )}
        {canEdit && (
          <Link href={`/sales/orders/${orderId}/edit`} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-medium text-text hover:bg-sunken">
            <Pencil className="size-4" /> Edit
          </Link>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            className="h-10"
            disabled={pending}
            onClick={() => {
              const reason = prompt("Why is this quotation being cancelled?");
              if (reason === null) return;
              start(async () => {
                const res = await cancelQuotation(orderId, reason);
                if (res.error) setError(res.error);
                else router.refresh();
              });
            }}
          >
            <XCircle className="size-4" /> Cancel quotation
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
