// Shared types and helpers for the salesman incentive (see migration 0012).
import type { Tone } from "@/components/ui";

export type IncentiveScheme = {
  id: string; effective_from: string;
  sales_target: number; sales_amount: number;
  billed_target: number; billed_amount: number;
  smart_target: number; smart_min_purchase: number; smart_pay_days: number; smart_amount: number;
  recovery_pct: number; recovery_amount: number; notes: string | null;
};

export type IncentiveSummary = {
  month: string; final_on: string; is_final: boolean; scheme: IncentiveScheme;
  net_sales: number; returns_earlier_bills: number; billed_shops: number; smart_shops: number; on_track_shops: number;
  month_billing: number; month_collected: number; recovery_pct: number;
  sales_earned: number; billed_earned: number; smart_earned: number; recovery_earned: number; total: number; max_total: number;
};

export type IncentiveShop = {
  retailer_id: string; code: string; shop_name: string; city: string | null; mobile: string;
  invoices: number; billed_taxable: number; billed_total: number; collected_in_month: number; unpaid: number;
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
    smart_shops: num(j.smart_shops), on_track_shops: num(j.on_track_shops), month_billing: num(j.month_billing),
    month_collected: num(j.month_collected), recovery_pct: num(j.recovery_pct), sales_earned: num(j.sales_earned),
    billed_earned: num(j.billed_earned), smart_earned: num(j.smart_earned), recovery_earned: num(j.recovery_earned),
    total: num(j.total), max_total: num(j.max_total), is_final: Boolean(j.is_final),
    scheme: {
      ...(s as unknown as IncentiveScheme),
      sales_target: num(s.sales_target), sales_amount: num(s.sales_amount), billed_target: num(s.billed_target), billed_amount: num(s.billed_amount),
      smart_target: num(s.smart_target), smart_min_purchase: num(s.smart_min_purchase), smart_pay_days: num(s.smart_pay_days), smart_amount: num(s.smart_amount),
      recovery_pct: num(s.recovery_pct), recovery_amount: num(s.recovery_amount),
    },
  };
}

export function toShops(rows: Record<string, unknown>[] | null): IncentiveShop[] {
  return (rows ?? []).map((r) => ({
    ...(r as unknown as IncentiveShop),
    invoices: num(r.invoices), billed_taxable: num(r.billed_taxable), billed_total: num(r.billed_total),
    collected_in_month: num(r.collected_in_month), unpaid: num(r.unpaid),
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

// Money still to collect (against this month's bills) to reach the recovery %.
export function recoveryGap(s: IncentiveSummary) {
  return Math.max(0, (s.scheme.recovery_pct / 100) * s.month_billing - s.month_collected);
}
