"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { ProductPicker } from "@/components/product-picker";
import { Card, Input, Label, Select, cn } from "@/components/ui";
import { recordMovement, transferStock } from "../actions";

type Warehouse = { id: string; name: string };
type EntryType = "stock_in" | "transfer" | "adjustment" | "damage" | "opening";

const TYPES: { key: EntryType; label: string; help: string }[] = [
  { key: "stock_in", label: "Stock in", help: "Goods received from a supplier or company." },
  { key: "transfer", label: "Transfer", help: "Move stock between warehouses." },
  { key: "adjustment", label: "Adjustment", help: "Correct the quantity, with a reason. For full recounts use Stock counts." },
  { key: "damage", label: "Damaged", help: "Remove damaged units from sellable stock." },
  { key: "opening", label: "Opening stock", help: "Starting quantity when you begin using the system." },
];

export function EntryForms({ warehouses, initialType, canSetCost }: { warehouses: Warehouse[]; initialType: EntryType; canSetCost: boolean }) {
  const [type, setType] = useState<EntryType>(initialType);
  const current = TYPES.find((t) => t.key === type)!;
  const defaultWh = warehouses[0]?.id;

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setType(t.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              t.key === type ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Card className="p-5">
        <p className="mb-4 text-sm text-slate-500">{current.help}</p>

        {type === "transfer" ? (
          <ActionForm key="transfer" action={transferStock} submitLabel="Record transfer">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Product</Label>
                <ProductPicker />
              </div>
              <div>
                <Label htmlFor="from_warehouse">From</Label>
                <Select id="from_warehouse" name="from_warehouse" defaultValue={defaultWh}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="to_warehouse">To</Label>
                <Select id="to_warehouse" name="to_warehouse" defaultValue={warehouses[1]?.id ?? defaultWh}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="qty">Quantity</Label>
                <Input id="qty" name="qty" type="number" min={0} step="any" required />
              </div>
              <div>
                <Label htmlFor="reason" hint="optional">Note</Label>
                <Input id="reason" name="reason" />
              </div>
            </div>
            {warehouses.length < 2 && (
              <p className="mt-3 text-sm text-amber-700">Add a second warehouse under Warehouses to transfer stock.</p>
            )}
          </ActionForm>
        ) : (
          <ActionForm key={type} action={recordMovement} submitLabel={`Record ${current.label.toLowerCase()}`}>
            <input type="hidden" name="type" value={type} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Product</Label>
                <ProductPicker />
              </div>
              <div>
                <Label htmlFor="warehouse_id">Warehouse</Label>
                <Select id="warehouse_id" name="warehouse_id" defaultValue={defaultWh}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              {type === "adjustment" ? (
                <div>
                  <Label htmlFor="direction">Change</Label>
                  <Select id="direction" name="direction" defaultValue="add">
                    <option value="add">Add to stock (+)</option>
                    <option value="remove">Remove from stock (−)</option>
                  </Select>
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}
              <div>
                <Label htmlFor="qty">Quantity</Label>
                <Input id="qty" name="qty" type="number" min={0} step="any" required />
              </div>
              {canSetCost && (type === "stock_in" || type === "opening") && (
                <div>
                  <Label htmlFor="unit_cost" hint="excl. GST, optional">Cost per unit (₹)</Label>
                  <Input id="unit_cost" name="unit_cost" type="number" min={0} step="0.01" placeholder="Product cost" />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="reason" hint={type === "adjustment" || type === "damage" ? "required" : "e.g. supplier bill no."}>
                  {type === "adjustment" || type === "damage" ? "Reason" : "Reference / note"}
                </Label>
                <Input id="reason" name="reason" required={type === "adjustment" || type === "damage"} />
              </div>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
