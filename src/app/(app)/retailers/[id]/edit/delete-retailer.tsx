"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast as notify } from "sonner";
import { Trash2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { askConfirm } from "@/components/confirm";
import { deleteRetailer } from "../../actions";

// Bottom of the edit page, Super Admin and Manager only. Works only for a shop with
// no history; anything else is refused with the reason (set it Inactive instead).
export function DeleteRetailer({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onDelete() {
    const ok = await askConfirm(`Delete ${name}? This cannot be undone.`, { confirmLabel: "Delete retailer", danger: true });
    if (!ok) return;
    setError(null);
    start(async () => {
      const res = await deleteRetailer(id);
      if (res.error) return setError(res.error);
      notify.success(`${res.name ?? name} deleted`);
      router.push("/retailers");
    });
  }

  return (
    <section aria-labelledby="del-h" className="mt-8 rounded-[var(--radius-card)] border border-red-600/25 p-4 sm:p-5">
      <h2 id="del-h" className="text-sm font-semibold text-text">Delete this retailer</h2>
      <p className="mt-1 text-[13px] text-text-2">
        For a shop entered twice or by mistake. Only possible when it has no quotations, invoices, payments, visits or route.
        A shop with history can be set to <b>Inactive</b> above instead.
      </p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Button variant="secondary" className="mt-3 border-red-600/40 text-red-700 hover:bg-red-50" disabled={pending} onClick={onDelete}>
        <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete retailer"}
      </Button>
    </section>
  );
}
