import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, Label, Select } from "@/components/ui";
import { addLocation, saveWarehouse } from "../actions";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const canEdit = profile.role === "super_admin" || profile.role === "manager";
  const supabase = await createClient();
  const [{ data: warehouses }, { data: locations }] = await Promise.all([
    supabase.from("warehouses").select("id, name, address, is_active").order("name"),
    supabase.from("warehouse_locations").select("id, warehouse_id, code, description").order("code"),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {(warehouses ?? []).map((w) => {
          const locs = (locations ?? []).filter((l) => l.warehouse_id === w.id);
          return (
            <Card key={w.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{w.name}</h2>
                  {w.address && <p className="text-sm text-slate-500">{w.address}</p>}
                </div>
                {w.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-slate-700">Racks / shelves ({locs.length})</div>
                {locs.length === 0 ? (
                  <p className="text-sm text-slate-500">None yet. Racks are also created when you type one on a product.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {locs.map((l) => (
                      <span key={l.id} title={l.description ?? undefined} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{l.code}</span>
                    ))}
                  </div>
                )}
              </div>

              {canEdit && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-accent-700">Edit warehouse / add rack</summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <ActionForm action={saveWarehouse} submitLabel="Save">
                      <input type="hidden" name="id" value={w.id} />
                      <div className="space-y-2">
                        <Input name="name" defaultValue={w.name} required aria-label="Name" />
                        <Input name="address" defaultValue={w.address ?? ""} placeholder="Address" aria-label="Address" />
                        <Select name="is_active" defaultValue={String(w.is_active)} aria-label="Status">
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </Select>
                      </div>
                    </ActionForm>
                    <ActionForm action={addLocation} submitLabel="Add rack">
                      <input type="hidden" name="warehouse_id" value={w.id} />
                      <div className="space-y-2">
                        <Input name="code" placeholder="Rack code, e.g. R2-S3" required className="uppercase" aria-label="Rack code" />
                        <Input name="description" placeholder="Description (optional)" aria-label="Description" />
                      </div>
                    </ActionForm>
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Add a warehouse</h2>
          <ActionForm action={saveWarehouse} submitLabel="Add warehouse">
            <div className="space-y-3">
              <div>
                <Label htmlFor="wh-name">Name</Label>
                <Input id="wh-name" name="name" required />
              </div>
              <div>
                <Label htmlFor="wh-address" hint="optional">Address</Label>
                <Input id="wh-address" name="address" />
              </div>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
