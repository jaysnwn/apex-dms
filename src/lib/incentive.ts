// Shared types and helpers for the salesman incentive (see migration 0012).
import type { Tone } from "@/components/ui";

export type IncentiveScheme = {
  id: string; effective_from: string;
  sales_target: number; sales_amount: number;
  billed_target: number; billed_amount: number;
  smart_target: number; smart_min_purchase: number; smart_pay_days: number; smart_amount: number;
  collection_slabs: Slab[]; notes: string | null;
};
export type Slab = { min_pct: number; amount: number };

export type IncentiveSummary = {
  month: string; final_on: string; is_final: boolean; scheme: IncentiveScheme;
  net_sales: number; returns_earlier_bills: number; billed_shops: number; smart_shops: number; on_track_shops: number;
  collection_due: number; collected: number; collection_pct: number; next_slab: Slab | null; next_slab_gap: number;
  sales_earned: number; billed_earned: number; smart_earned: number; collection_earned: number; total: number; max_total: number;
};

export type IncentiveShop = {
  retailer_id: string; code: string; shop_name: string; city: string | null; mobile: string;
  invoices: number; billed_taxable: number; billed_total: number; due_amount: number; due_collected: number; unpaid: number;
  next_deadline: string | null; status: "not_billed" | "below_min" | "smart" | "on_track" | "missed";
};

export const SHOP_STATUS: Record<IncentiveShop["status"], { label: string; tone: Tone }> = {
  smart: { label: "Smart ✓", tone: "green" },
  on_track: { label: "Pay before deadline", tone: "amber" },
  below_min: { label: "Needs more purchase", tone: "blue" },
  missed: { label: "Paid late", tone: "red" },
  not_billed: { label: "Not billed", tone: "slate" },
};

const num = (v: unknown) => Number(v ?? 0);

export function toSummary(j: Record<string, unknown> | null): IncentiveSummary | null {
  if (!j) return null;
  const s = j.scheme as Record<string, unknown>;
  return {
    ...(j as unknown as IncentiveSummary),
    net_sales: num(j.net_sales), returns_earlier_bills: num(j.returns_earlier_bills), billed_shops: num(j.billed_shops),
    smart_shops: num(j.smart_shops), on_track_shops: num(j.on_track_shops), collection_due: num(j.collection_due),
    collected: num(j.collected), collection_pct: num(j.collection_pct), next_slab_gap: num(j.next_slab_gap),
    next_slab: j.next_slab ? toSlabs([j.next_slab])[0] : null, sales_earned: num(j.sales_earned),
    billed_earned: num(j.billed_earned), smart_earned: num(j.smart_earned), collection_earned: num(j.collection_earned),
    total: num(j.total), max_total: num(j.max_total), is_final: Boolean(j.is_final),
    scheme: {
      ...(s as unknown as IncentiveScheme),
      sales_target: num(s.sales_target), sales_amount: num(s.sales_amount), billed_target: num(s.billed_target), billed_amount: num(s.billed_amount),
      smart_target: num(s.smart_target), smart_min_purchase: num(s.smart_min_purchase), smart_pay_days: num(s.smart_pay_days), smart_amount: num(s.smart_amount),
      collection_slabs: toSlabs(s.collection_slabs),
    },
  };
}

export function toShops(rows: Record<string, unknown>[] | null): IncentiveShop[] {
  return (rows ?? []).map((r) => ({
    ...(r as unknown as IncentiveShop),
    invoices: num(r.invoices), billed_taxable: num(r.billed_taxable), billed_total: num(r.billed_total),
    due_amount: num(r.due_amount), due_collected: num(r.due_collected), unpaid: num(r.unpaid),
  }));
}

// "2026-11" ⇄ "2026-11-01"
export function monthParam(v: string | undefined, today: string) {
  return v && /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : today.slice(0, 8) + "01";
}
export function monthLabel(d: string) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function shiftMonth(d: string, by: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCMonth(x.getUTCMonth() + by);
  return x.toISOString().slice(0, 10);
}

export function toSlabs(v: unknown): Slab[] {
  return (Array.isArray(v) ? v : [])
    .map((e) => ({ min_pct: num((e as Slab).min_pct), amount: num((e as Slab).amount) }))
    .sort((a, b) => a.min_pct - b.min_pct);
}
