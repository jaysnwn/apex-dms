import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveMaster } from "../actions";

export const metadata: Metadata = { title: "Brands and categories" };

type Row = { id: string; name: string; is_active: boolean };

export default async function ProductSettingsPage() {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const [brands, categories] = await Promise.all([
    supabase.from("brands").select("id, name, is_active").order("name"),
    supabase.from("categories").select("id, name, is_active").order("name"),
  ]);

  return (
    <>
      <PageHeader title="Brands and categories" description="Add any brand you distribute. Inactive ones stay on old records but can't be picked for new products." />
      <div className="grid gap-6 lg:grid-cols-2">
        <MasterList title="Brands" kind="brands" rows={(brands.data ?? []) as Row[]} />
        <MasterList title="Categories" kind="categories" rows={(categories.data ?? []) as Row[]} />
      </div>
    </>
  );
}

function MasterList({ title, kind, rows }: { title: string; kind: "brands" | "categories"; rows: Row[] }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <ActionForm action={saveMaster} submitLabel={`Add ${kind === "brands" ? "brand" : "category"}`}>
        <input type="hidden" name="kind" value={kind} />
        <Input name="name" placeholder={kind === "brands" ? "Brand name" : "Category name"} required />
      </ActionForm>
      <ul className="mt-5 divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="py-2">
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <span className="font-medium">{r.name}</span>
                {r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
              </summary>
              <ActionForm action={saveMaster} submitLabel="Save" className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={r.id} />
                <Input name="name" defaultValue={r.name} required />
                <Select name="is_active" defaultValue={String(r.is_active)}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </ActionForm>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
