import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeSearch } from "@/lib/format";
import { EMPTY_SUMMARY, type ExpenseCategory, type ExpenseRow, type ExpenseSummary } from "@/lib/expense-labels";

export type ExpenseFilters = {
  from: string;
  to: string;
  employee?: string;
  category?: string;
  brand?: string; // brand id, or "none" = for all brands
  route?: string;
  status?: string; // expense status, or "to_reimburse"
  q?: string;
  sort?: "date" | "amount" | "-amount" | "submitted";
  page?: number;
};

export const PAGE_SIZE = 25;
const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["draft", "submitted", "approved", "rejected", "returned", "cancelled", "to_reimburse"];

// Builds one filtered query on expense_list (RLS-style filtering is inside the view).
export function expenseQuery(sb: SupabaseClient, f: ExpenseFilters, opts: { count?: boolean } = {}) {
  let q = sb.from("expense_list").select("*", opts.count ? { count: "exact" } : undefined)
    .gte("expense_date", f.from).lte("expense_date", f.to);
  if (f.employee && UUID.test(f.employee)) q = q.eq("employee_id", f.employee);
  if (f.category && UUID.test(f.category)) q = q.eq("category_id", f.category);
  if (f.route && UUID.test(f.route)) q = q.eq("route_id", f.route);
  if (f.brand === "none") q = q.is("brand_id", null);
  else if (f.brand && UUID.test(f.brand)) q = q.eq("brand_id", f.brand);
  if (f.status === "to_reimburse") q = q.gt("outstanding", 0);
  else if (f.status && STATUSES.includes(f.status)) q = q.eq("status", f.status);
  const s = safeSearch(f.q);
  if (s) q = q.or(`expense_no.ilike.%${s}%,description.ilike.%${s}%,employee_name.ilike.%${s}%,category_name.ilike.%${s}%,route_name.ilike.%${s}%`);
  return q;
}

export async function listExpenses(sb: SupabaseClient, f: ExpenseFilters) {
  const page = Math.max(1, f.page ?? 1);
  let q = expenseQuery(sb, f, { count: true });
  if (f.sort === "amount") q = q.order("amount", { ascending: true });
  else if (f.sort === "-amount") q = q.order("amount", { ascending: false });
  else if (f.sort === "submitted") q = q.order("submitted_at", { ascending: true, nullsFirst: false });
  else q = q.order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  const { data, count, error } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as ExpenseRow[], total: count ?? 0, page };
}

// Totals are computed by the database (expense_summary), never from the rows on screen.
export async function expenseSummary(sb: SupabaseClient, f: ExpenseFilters): Promise<ExpenseSummary> {
  const { data, error } = await sb.rpc("expense_summary", {
    p_from: f.from,
    p_to: f.to,
    p_employee: f.employee && UUID.test(f.employee) ? f.employee : null,
    p_brand: f.brand === "none" || (f.brand && UUID.test(f.brand)) ? f.brand : null,
    p_route: f.route && UUID.test(f.route) ? f.route : null,
    p_category: f.category && UUID.test(f.category) ? f.category : null,
    p_status: f.status && STATUSES.includes(f.status) ? f.status : null,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!r) return EMPTY_SUMMARY;
  return Object.fromEntries(Object.entries(EMPTY_SUMMARY).map(([k]) => [k, Number(r[k] ?? 0)])) as ExpenseSummary;
}

export async function loadExpenseOptions(sb: SupabaseClient) {
  const [cats, people, routes, brandIds, brands] = await Promise.all([
    sb.from("expense_categories").select("id, code, name, receipt_required, route_required, approval_required, auto_approve_limit, is_active, sort_order").order("sort_order").order("name"),
    sb.from("profiles").select("id, full_name, role, is_active").order("full_name"),
    sb.from("routes").select("id, name, default_salesman_id, is_active").order("name"),
    sb.rpc("my_brand_ids"),
    sb.from("brands").select("id, name, code, is_active").order("name"),
  ]);
  const allowed = new Set((brandIds.data as string[] | null) ?? []);
  return {
    categories: (cats.data ?? []) as ExpenseCategory[],
    employees: (people.data ?? []).filter((p) => p.is_active) as { id: string; full_name: string; role: string }[],
    allPeople: (people.data ?? []) as { id: string; full_name: string; role: string }[],
    routes: (routes.data ?? []) as { id: string; name: string; default_salesman_id: string | null; is_active: boolean }[],
    brands: (brands.data ?? []).filter((b) => b.is_active && allowed.has(b.id)) as { id: string; name: string; code: string }[],
  };
}

export async function signedReceipts(sb: SupabaseClient, paths: (string | null)[]) {
  const list = [...new Set(paths.filter(Boolean))] as string[];
  if (!list.length) return new Map<string, string>();
  const { data } = await sb.storage.from("expense-receipts").createSignedUrls(list, 3600);
  return new Map((data ?? []).filter((s) => s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
