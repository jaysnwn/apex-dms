"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui";
import { GST_STATES } from "@/lib/states";
import { RETAILER_CLASS_LABELS, RETAILER_STATUS_LABELS } from "@/lib/format";
import { checkDuplicates, saveRetailer, type Duplicate } from "./actions";

type Option = { id: string; name: string };
export type RetailerRow = {
  id: string;
  shop_name: string;
  owner_name: string | null;
  mobile: string;
  alt_mobile: string | null;
  gstin: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state_code: string;
  billing_pincode: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_pincode: string | null;
  salesman_id: string | null;
  route_id: string | null;
  credit_days: number;
  credit_limit: number;
  status: string;
  classification: string | null;
  notes: string | null;
};

const CREDIT_OPTIONS = [10, 15, 20, 30];

export function RetailerForm({
  retailer,
  salesmen,
  routes,
  isSalesman,
  defaults,
}: {
  retailer?: RetailerRow;
  salesmen: Option[];
  routes: Option[];
  isSalesman: boolean;
  defaults?: { route_id?: string; billing_city?: string };
}) {
  const [dups, setDups] = useState<Duplicate[]>([]);
  const [state, setState] = useState(retailer?.billing_state_code ?? "27");
  const sameDelivery =
    !retailer ||
    (!retailer.delivery_address && !retailer.delivery_city) ||
    retailer.delivery_address === retailer.billing_address;
  const [same, setSame] = useState(sameDelivery);
  const initialCustom = retailer && !CREDIT_OPTIONS.includes(retailer.credit_days);
  const [credit, setCredit] = useState(initialCustom ? "custom" : String(retailer?.credit_days ?? 15));

  async function runCheck(form: HTMLFormElement) {
    const f = new FormData(form);
    const result = await checkDuplicates({
      mobile: String(f.get("mobile") ?? ""),
      gstin: String(f.get("gstin") ?? ""),
      shop_name: String(f.get("shop_name") ?? ""),
      city: String(f.get("billing_city") ?? ""),
      exclude: retailer?.id,
    });
    setDups(result);
  }

  const onBlurCheck = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.form) runCheck(e.currentTarget.form);
  };

  const onlySimilar = dups.length > 0 && dups.every((d) => d.reason === "Similar shop name");

  return (
    <ActionForm action={saveRetailer} submitLabel={retailer ? "Save retailer" : "Create retailer"}>
      {retailer && <input type="hidden" name="id" value={retailer.id} />}

      {dups.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Possible duplicate retailer
          </div>
          <ul className="space-y-1">
            {dups.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.shop_name}</span> ({d.code}{d.city ? `, ${d.city}` : ""}, mobile {d.mobile_hint}) — {d.reason}
              </li>
            ))}
          </ul>
          {onlySimilar && (
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" name="confirm_similar" value="1" className="size-4" /> This is a different shop — save anyway
            </label>
          )}
        </div>
      )}

      <Section title="Shop">
        <div className="sm:col-span-2">
          <Label htmlFor="shop_name">Shop name</Label>
          <Input id="shop_name" name="shop_name" defaultValue={retailer?.shop_name} required onBlur={onBlurCheck} />
        </div>
        <div>
          <Label htmlFor="owner_name">Owner name</Label>
          <Input id="owner_name" name="owner_name" defaultValue={retailer?.owner_name ?? ""} />
        </div>
        <div>
          <Label htmlFor="mobile">Mobile number</Label>
          <Input id="mobile" name="mobile" defaultValue={retailer?.mobile} required inputMode="tel" maxLength={14} onBlur={onBlurCheck} placeholder="10 digits" />
        </div>
        <div>
          <Label htmlFor="alt_mobile" hint="optional">Alternate mobile</Label>
          <Input id="alt_mobile" name="alt_mobile" defaultValue={retailer?.alt_mobile ?? ""} inputMode="tel" maxLength={14} />
        </div>
        <div>
          <Label htmlFor="gstin" hint="optional">GSTIN</Label>
          <Input
            id="gstin"
            name="gstin"
            defaultValue={retailer?.gstin ?? ""}
            maxLength={15}
            className="uppercase"
            onBlur={(e) => {
              const g = e.currentTarget.value.trim();
              if (/^[0-9]{2}/.test(g)) setState(g.slice(0, 2));
              onBlurCheck(e);
            }}
          />
        </div>
      </Section>

      <Section title="Billing address">
        <div className="sm:col-span-2">
          <Label htmlFor="billing_address">Address</Label>
          <Textarea id="billing_address" name="billing_address" rows={2} defaultValue={retailer?.billing_address ?? ""} />
        </div>
        <div>
          <Label htmlFor="billing_city">City / town</Label>
          <Input id="billing_city" name="billing_city" defaultValue={retailer?.billing_city ?? defaults?.billing_city ?? ""} onBlur={onBlurCheck} />
        </div>
        <div>
          <Label htmlFor="billing_pincode">PIN code</Label>
          <Input id="billing_pincode" name="billing_pincode" defaultValue={retailer?.billing_pincode ?? ""} inputMode="numeric" maxLength={6} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="billing_state_code" hint="decides CGST + SGST or IGST">State</Label>
          <Select id="billing_state_code" name="billing_state_code" value={state} onChange={(e) => setState(e.target.value)}>
            {Object.entries(GST_STATES).map(([code, name]) => (
              <option key={code} value={code}>{code} · {name}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="same_delivery" value="1" checked={same} onChange={(e) => setSame(e.target.checked)} className="size-4" />
          Delivery address is the same as billing
        </label>
        {!same && (
          <>
            <div className="sm:col-span-2">
              <Label htmlFor="delivery_address">Delivery address</Label>
              <Textarea id="delivery_address" name="delivery_address" rows={2} defaultValue={retailer?.delivery_address ?? ""} />
            </div>
            <div>
              <Label htmlFor="delivery_city">Delivery city</Label>
              <Input id="delivery_city" name="delivery_city" defaultValue={retailer?.delivery_city ?? ""} />
            </div>
            <div>
              <Label htmlFor="delivery_pincode">Delivery PIN code</Label>
              <Input id="delivery_pincode" name="delivery_pincode" defaultValue={retailer?.delivery_pincode ?? ""} inputMode="numeric" maxLength={6} />
            </div>
          </>
        )}
      </Section>

      <Section title={isSalesman ? "Route" : "Assignment and credit"}>
        {!isSalesman && (
          <div>
            <Label htmlFor="salesman_id">Assigned salesman</Label>
            <Select id="salesman_id" name="salesman_id" defaultValue={retailer?.salesman_id ?? ""}>
              <option value="">— Not assigned —</option>
              {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="route_id">Route</Label>
          <Select id="route_id" name="route_id" defaultValue={retailer?.route_id ?? defaults?.route_id ?? ""}>
            <option value="">— No route —</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        {isSalesman ? (
          <>
            <input type="hidden" name="credit_days" value="15" />
            <input type="hidden" name="credit_limit" value="0" />
            <p className="text-sm text-slate-500 sm:col-span-2">The office will set the credit period and limit.</p>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="credit_days">Credit period</Label>
              <div className="flex gap-2">
                <Select id="credit_days" name="credit_days" value={credit} onChange={(e) => setCredit(e.target.value)}>
                  {CREDIT_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                  <option value="custom">Custom…</option>
                </Select>
                {credit === "custom" && (
                  <Input name="credit_days_custom" type="number" min={0} max={365} defaultValue={retailer?.credit_days ?? 45} className="w-24" aria-label="Custom days" />
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="credit_limit" hint="0 = no limit">Credit limit (₹)</Label>
              <Input id="credit_limit" name="credit_limit" type="number" min={0} step="1" defaultValue={retailer?.credit_limit ?? 0} />
            </div>
            <div>
              <Label htmlFor="status">Account status</Label>
              <Select id="status" name="status" defaultValue={retailer?.status ?? "active"}>
                {Object.entries(RETAILER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="classification" hint="automatic from M4">Classification</Label>
              <Select id="classification" name="classification" defaultValue={retailer?.classification ?? ""}>
                <option value="">— Not classified —</option>
                {Object.entries(RETAILER_CLASS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <Label htmlFor="notes" hint="optional">Notes</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={retailer?.notes ?? ""} />
        </div>
      </Section>
    </ActionForm>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
