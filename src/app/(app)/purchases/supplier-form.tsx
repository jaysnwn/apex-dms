"use client";

import { ActionForm } from "@/components/action-form";
import { Input, Label, Textarea } from "@/components/ui";
import { GST_STATES } from "@/lib/states";
import { saveSupplier } from "./actions";

export type SupplierRow = {
  id?: string; name?: string; gstin?: string | null; state_code?: string | null; contact_name?: string | null; mobile?: string | null;
  email?: string | null; address?: string | null; city?: string | null; pincode?: string | null; credit_days?: number;
  bank_details?: string | null; notes?: string | null; is_active?: boolean;
};

export function SupplierForm({ supplier }: { supplier?: SupplierRow }) {
  const s = supplier ?? {};
  return (
    <ActionForm action={saveSupplier} submitLabel={s.id ? "Save changes" : "Create supplier"}>
      {s.id && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="name">Supplier name</Label><Input id="name" name="name" defaultValue={s.name ?? ""} required /></div>
        <div><Label htmlFor="gstin" hint="sets the state">GSTIN</Label><Input id="gstin" name="gstin" defaultValue={s.gstin ?? ""} maxLength={15} className="font-mono uppercase" /></div>
        <div>
          <Label htmlFor="state" hint="if no GSTIN">State</Label>
          <select id="state" name="state_code" defaultValue={s.state_code ?? ""} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="">—</option>
            {Object.entries(GST_STATES).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}
          </select>
        </div>
        <div><Label htmlFor="contact">Contact person</Label><Input id="contact" name="contact_name" defaultValue={s.contact_name ?? ""} /></div>
        <div><Label htmlFor="mobile">Mobile</Label><Input id="mobile" name="mobile" defaultValue={s.mobile ?? ""} inputMode="tel" maxLength={14} /></div>
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={s.email ?? ""} /></div>
        <div><Label htmlFor="credit">Credit period (days)</Label><Input id="credit" name="credit_days" type="number" min={0} max={365} defaultValue={s.credit_days ?? 30} /></div>
        <div className="sm:col-span-2"><Label htmlFor="address">Address</Label><Input id="address" name="address" defaultValue={s.address ?? ""} /></div>
        <div><Label htmlFor="city">City</Label><Input id="city" name="city" defaultValue={s.city ?? ""} /></div>
        <div><Label htmlFor="pin">PIN code</Label><Input id="pin" name="pincode" defaultValue={s.pincode ?? ""} maxLength={6} /></div>
        <div className="sm:col-span-2"><Label htmlFor="bank" hint="for payments">Bank details</Label><Textarea id="bank" name="bank_details" rows={2} defaultValue={s.bank_details ?? ""} /></div>
        <div className="sm:col-span-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={2} defaultValue={s.notes ?? ""} /></div>
        {s.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={s.is_active ?? true} className="size-4" /> Active (shown when creating purchases)
          </label>
        )}
      </div>
    </ActionForm>
  );
}
