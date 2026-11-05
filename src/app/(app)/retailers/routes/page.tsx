import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { saveRoute } from "../actions";

export const metadata: Metadata = { title: "Routes" };

export default async function RoutesPage() {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const [{ data: routes }, { data: salesmen }, { data: retailers }] = await Promise.all([
    supabase.from("routes").select("id, name, description, default_salesman_id, is_active").order("name"),
    supabase.from("profiles").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
    supabase.from("retailers").select("route_id"),
  ]);
  const counts = new Map<string, number>();
  for (const r of retailers ?? []) if (r.route_id) counts.set(r.route_id, (counts.get(r.route_id) ?? 0) + 1);
  const names = new Map((salesmen ?? []).map((s) => [s.id as string, s.full_name as string]));

  const salesmanSelect = (value?: string | null) => (
    <Select name="default_salesman_id" defaultValue={value ?? ""} aria-label="Salesman">
      <option value="">— No salesman —</option>
      {(salesmen ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
    </Select>
  );

  return (
    <>
      <PageHeader
        title="Routes"
        description="A salesman sees every retailer on the routes assigned to him. Daily visit plans and targets come in M5."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          {(routes ?? []).length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No routes yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(routes ?? []).map((r) => (
                <li key={r.id} className="p-4">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-sm text-slate-500">
                          {names.get(r.default_salesman_id ?? "") ?? "No salesman"} · {counts.get(r.id) ?? 0} retailers
                        </div>
                      </div>
                      {r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                    </summary>
                    <ActionForm action={saveRoute} submitLabel="Save route" className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input name="name" defaultValue={r.name} required aria-label="Route name" />
                        {salesmanSelect(r.default_salesman_id)}
                        <Input name="description" defaultValue={r.description ?? ""} placeholder="Areas covered" aria-label="Description" />
                        <Select name="is_active" defaultValue={String(r.is_active)} aria-label="Status">
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </Select>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Add a route</h2>
          <ActionForm action={saveRoute} submitLabel="Add route">
            <div className="space-y-3">
              <div>
                <Label htmlFor="route-name">Name</Label>
                <Input id="route-name" name="name" required placeholder="e.g. Sangamner City" />
              </div>
              <div>
                <Label>Salesman</Label>
                {salesmanSelect()}
              </div>
              <div>
                <Label htmlFor="route-desc" hint="optional">Areas covered</Label>
                <Input id="route-desc" name="description" />
              </div>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
