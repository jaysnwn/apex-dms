import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { signProductImages } from "@/lib/images";
import { Badge, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { BrandBadge } from "@/components/brand-badge";
import { saveMaster } from "../actions";
import { LogoUpload } from "./logo-upload";

export const metadata: Metadata = { title: "Brands and categories" };

type Row = { id: string; name: string; is_active: boolean };

export default async function ProductSettingsPage() {
  const { profile } = await requireRole("super_admin", "manager");
  const isAdmin = profile.role === "super_admin";
  const supabase = await createClient();
  const ctx = await getBrandContext();
  const [{ data: brands }, { data: categories }] = await Promise.all([
    supabase.from("brands").select("id, name, code, logo_path, is_active").order("name"),
    supabase.from("categories").select("id, name, is_active, brand_id").in("brand_id", ctx.brands.map((b) => b.id)).order("name"),
  ]);
  const logos = await signProductImages(supabase, (brands ?? []).map((b) => b.logo_path));
  const visibleBrands = (brands ?? []).filter((b) => isAdmin || ctx.brands.some((x) => x.id === b.id));

  return (
    <>
      <PageHeader title="Brands and categories" description="Each brand has its own products, categories, warehouses, stock and reports." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Brands</h2>
          <p className="mb-4 text-xs text-slate-500">The short code starts every invoice number of that brand (e.g. CQ/26-27/00001). The logo is printed on that brand&apos;s stock reports.</p>
          {isAdmin && (
            <ActionForm action={saveMaster} submitLabel="Add brand" className="mb-5">
              <input type="hidden" name="kind" value="brands" />
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <Input name="name" placeholder="Brand name" required />
                <Input name="code" placeholder="Code" required maxLength={2} className="uppercase" aria-label="Short code" />
              </div>
            </ActionForm>
          )}
          <ul className="divide-y divide-slate-100">
            {visibleBrands.map((b) => (
              <li key={b.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BrandBadge name={b.name} code={b.code} />
                    <span className="font-mono text-xs text-slate-500">{b.code}</span>
                    {!b.is_active && <Badge>Inactive</Badge>}
                  </div>
                  <LogoUpload brandId={b.id} url={b.logo_path ? logos.get(b.logo_path) ?? null : null} canEdit={isAdmin} />
                </div>
                {isAdmin && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-accent-700">Rename / deactivate</summary>
                    <ActionForm action={saveMaster} submitLabel="Save" className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="kind" value="brands" />
                      <input type="hidden" name="id" value={b.id} />
                      <Input name="name" defaultValue={b.name} required />
                      <Select name="is_active" defaultValue={String(b.is_active)}>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </Select>
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Categories</h2>
          <p className="mb-4 text-xs text-slate-500">Every brand keeps its own category list.</p>
          <ActionForm action={saveMaster} submitLabel="Add category" className="mb-5">
            <input type="hidden" name="kind" value="categories" />
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <Select name="brand_id" defaultValue={ctx.current?.id ?? ctx.brands[0]?.id} aria-label="Brand">
                {ctx.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
              <Input name="name" placeholder="Category name" required />
            </div>
          </ActionForm>
          {ctx.brands.filter((b) => !ctx.current || b.id === ctx.current.id).map((b) => (
            <div key={b.id} className="mb-4">
              <div className="mb-1"><BrandBadge name={b.name} code={b.code} /></div>
              <ul className="divide-y divide-slate-100">
                {((categories ?? []) as (Row & { brand_id: string })[]).filter((c) => c.brand_id === b.id).map((r) => (
                  <li key={r.id} className="py-2">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between">
                        <span className="font-medium">{r.name}</span>
                        {r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                      </summary>
                      <ActionForm action={saveMaster} submitLabel="Save" className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="kind" value="categories" />
                        <input type="hidden" name="id" value={r.id} />
                        <div><Label htmlFor={`c-${r.id}`}>Name</Label><Input id={`c-${r.id}`} name="name" defaultValue={r.name} required /></div>
                        <div><Label htmlFor={`s-${r.id}`}>Status</Label>
                          <Select id={`s-${r.id}`} name="is_active" defaultValue={String(r.is_active)}>
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </Select>
                        </div>
                      </ActionForm>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
