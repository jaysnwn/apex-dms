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
        <Label htmlFor="doc_prefix" hint="e.g. APX/INV/26-27/00001">Document prefix</Label>
        <Input id="doc_prefix" name="doc_prefix" defaultValue={settings.doc_prefix} maxLength={6} required className="uppercase" />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="green">{state.ok}</Alert>}
      </div>
    </form>
  );
}
