"use client";

import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";

export type CompanySettings = {
  legal_name: string;
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank_details: string | null;
  invoice_terms: string | null;
  doc_prefix: string;
  salesman_max_discount: number;
  billing_max_discount: number;
  reorder_lead_days: number;
  reorder_cover_days: number;
};

export function SettingsForm({ settings }: { settings: CompanySettings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="legal_name">Legal name</Label>
        <Input id="legal_name" name="legal_name" defaultValue={settings.legal_name} required />
      </div>
      <div>
        <Label htmlFor="gstin">GSTIN</Label>
        <Input id="gstin" name="gstin" defaultValue={settings.gstin ?? ""} maxLength={15} className="uppercase" />
      </div>
      <div>
        <Label htmlFor="state_code" hint="27 = Maharashtra">GST state code</Label>
        <Input id="state_code" name="state_code" defaultValue={settings.state_code ?? "27"} maxLength={2} required />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" rows={2} defaultValue={settings.address ?? ""} />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={settings.phone ?? ""} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={settings.email ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="bank_details" hint="printed on invoices">Bank details</Label>
        <Textarea id="bank_details" name="bank_details" rows={3} defaultValue={settings.bank_details ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="invoice_terms" hint="printed on invoices">Terms and conditions</Label>
        <Textarea id="invoice_terms" name="invoice_terms" rows={3} defaultValue={settings.invoice_terms ?? ""} />
      </div>
      <div>
        <Label htmlFor="doc_prefix" hint="orders, receipts, purchases">Document prefix</Label>
        <Input id="doc_prefix" name="doc_prefix" defaultValue={settings.doc_prefix} maxLength={6} required className="uppercase" />
      </div>
      <div className="hidden sm:block" />
      <div className="border-t border-slate-100 pt-4 sm:col-span-2"><h3 className="font-semibold">Billing and stock rules</h3><p className="text-xs text-slate-500">Super Admin and Managers can give any discount and change prices; these limits apply to the other roles.</p></div>
      <div>
        <Label htmlFor="billing_max_discount" hint="%">Max discount — billing staff</Label>
        <Input id="billing_max_discount" name="billing_max_discount" type="number" min={0} max={100} step="0.5" defaultValue={settings.billing_max_discount} required />
      </div>
      <div>
        <Label htmlFor="salesman_max_discount" hint="%">Max discount — salesmen</Label>
        <Input id="salesman_max_discount" name="salesman_max_discount" type="number" min={0} max={100} step="0.5" defaultValue={settings.salesman_max_discount} required />
      </div>
      <div>
        <Label htmlFor="reorder_lead_days" hint="days from order to arrival">Supplier delivery time</Label>
        <Input id="reorder_lead_days" name="reorder_lead_days" type="number" min={0} max={180} defaultValue={settings.reorder_lead_days} required />
      </div>
      <div>
        <Label htmlFor="reorder_cover_days" hint="days of sales to order for">Reorder cover</Label>
        <Input id="reorder_cover_days" name="reorder_cover_days" type="number" min={1} max={365} defaultValue={settings.reorder_cover_days} required />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="green">{state.ok}</Alert>}
      </div>
    </form>
  );
}
