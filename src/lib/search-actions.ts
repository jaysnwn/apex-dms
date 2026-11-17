"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchSource, searchWords } from "@/lib/search-words";

export type SearchHit = {
  kind: "invoice" | "retailer" | "product";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

// The command palette's search: invoices, retailers and products by number, name,
// code or phone. Uses the same search functions as the list pages, so the database
// rules (RLS) decide what each person can find. Read-only.
export async function searchEverything(q: string): Promise<SearchHit[]> {
  await requireRole();
  const words = searchWords(q);
  if (words.length === 0) return [];
  const supabase = await createClient();

  const [inv, ret, prod] = await Promise.all([
    searchSource(supabase, "invoices", "search_invoices", words)
      .select("id, invoice_no, invoice_date, grand_total, retailer_snapshot")
      .order("invoice_date", { ascending: false })
      .limit(5),
    searchSource(supabase, "retailer_directory", "search_retailer_directory", words)
      .select("id, code, shop_name, mobile, billing_city")
      .order("shop_name")
      .limit(5),
    searchSource(supabase, "products", "search_products", words)
      .select("id, name, sku")
      .eq("is_active", true)
      .order("name")
      .limit(5),
  ]);

  const inr = (n: number) => "₹" + Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hits: SearchHit[] = [];
  for (const i of (inv.data ?? []) as { id: string; invoice_no: string; invoice_date: string; grand_total: number; retailer_snapshot: { shop_name?: string } | null }[]) {
    hits.push({ kind: "invoice", id: i.id, title: i.invoice_no, subtitle: `${i.retailer_snapshot?.shop_name ?? ""} · ${inr(i.grand_total)}`, href: `/sales/invoices/${i.id}` });
  }
  for (const r of (ret.data ?? []) as { id: string; code: string | null; shop_name: string; mobile: string | null; billing_city: string | null }[]) {
    hits.push({ kind: "retailer", id: r.id, title: r.shop_name, subtitle: [r.code, r.mobile, r.billing_city].filter(Boolean).join(" · "), href: `/retailers/${r.id}` });
  }
  for (const p of (prod.data ?? []) as { id: string; name: string; sku: string | null }[]) {
    hits.push({ kind: "product", id: p.id, title: p.name, subtitle: p.sku ?? "", href: `/products/${p.id}` });
  }
  return hits;
}
