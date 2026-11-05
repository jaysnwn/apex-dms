"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { reallocatePayment, setPaymentStatus } from "../actions";

export function PaymentStatusActions({ id, status, canCancel }: { id: string; status: string; canCancel: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (s: "received" | "bounced" | "cancelled", ask: string) => {
    const note = prompt(ask);
    if (note === null) return;
    start(async () => {
      const res = await setPaymentStatus(id, s, note);
      if (res.error) setError(res.error); else router.refresh();
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "cheque_pending" && (
          <>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => run("received", "Cheque cleared — note (optional)")}>Mark cheque cleared</Button>
            <Button variant="danger" disabled={pending} onClick={() => run("bounced", "Why did the cheque bounce?")}>Cheque bounced</Button>
          </>
        )}
        {(status === "received" || status === "cheque_pending") && (
          <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
            const res = await reallocatePayment(id, null);
            if (res.error) setError(res.error); else router.refresh();
          })}>Re-apply oldest first</Button>
        )}
        {canCancel && (status === "received" || status === "cheque_pending") && (
          <Button variant="ghost" className="text-red-700" disabled={pending} onClick={() => run("cancelled", "Why is this payment being cancelled? (entered by mistake, duplicate…)")}>Cancel payment</Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
