"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/actions";
import { getCatalogue } from "./data";

const FIELD = ["salesman", "manager", "super_admin"] as const;

// Fresh catalogue + stock for the order screen (also cached on the phone).
export async function loadCatalogue() {
  await requireRole(...FIELD);
  const supabase = await createClient();
  return getCatalogue(supabase);
}

export type QuoteInput = {
  clientUuid: string;
  retailerId: string;
  creditDays: number;
  notes: string;
  lines: { product_id: string; qty: number; discount_pct: number }[];
};

// Same retry key → same order. Each brand of a split order gets its own key, derived
// from the phone's key, so a resend never creates a second copy of any part.
function brandKey(clientUuid: string, brandId: string, first: boolean) {
  if (first) return clientUuid;
  const h = createHash("sha256").update(`${clientUuid}:${brandId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type SentQuote = { orderId: string; orderNo: string; total: number; brand: string };

// Save a quotation (never an invoice). One invoice is for one brand, so a cart
// with CONQRETE and BLUEI items becomes one quotation per brand automatically.
// Safe to resend: the same clientUuid returns the same order(s).
export async function submitQuotation(q: QuoteInput): Promise<{ ok?: boolean; orderId?: string; orderNo?: string; total?: number; orders?: SentQuote[]; error?: string }> {
  await requireRole(...FIELD);
  if (!q.retailerId) return { error: "Choose the outlet." };
  if (!q.lines.length) return { error: "Add at least one product." };
  const supabase = await createClient();
  const { data: prods } = await supabase.from("catalog").select("id, brand_id, brand_name").in("id", q.lines.map((l) => l.product_id));
  const brandOf = new Map((prods ?? []).map((p) => [p.id as string, { id: p.brand_id as string, name: p.brand_name as string }]));
  const groups = new Map<string, { name: string; lines: QuoteInput["lines"] }>();
  for (const l of q.lines) {
    const b = brandOf.get(l.product_id);
    if (!b) return { error: "A product in the order is no longer available. Refresh the catalogue." };
    const g = groups.get(b.id) ?? { name: b.name, lines: [] };
    g.lines.push(l);
    groups.set(b.id, g);
  }
  const orders: SentQuote[] = [];
  const keys = [...groups.keys()].sort();
  for (const [i, brandId] of keys.entries()) {
    const g = groups.get(brandId)!;
    const { data: id, error } = await supabase.rpc("save_quotation", {
      p_order_id: null,
      p_retailer_id: q.retailerId,
      p_credit_days: q.creditDays,
      p_notes: q.notes || null,
      p_lines: g.lines,
      p_client_uuid: brandKey(q.clientUuid, brandId, i === 0),
    });
    if (error) return { error: orders.length ? `${orders.map((o) => o.brand).join(", ")} saved; ${g.name} failed: ${dbError(error)}` : dbError(error), orders };
    const { data: o } = await supabase.from("orders").select("order_no, grand_total").eq("id", id as string).single();
    orders.push({ orderId: id as string, orderNo: o?.order_no ?? "", total: Number(o?.grand_total ?? 0), brand: g.name });
  }
  revalidatePath("/m");
  revalidatePath("/sales");
  return { ok: true, orderId: orders[0].orderId, orderNo: orders[0].orderNo, total: orders.reduce((t, o) => t + o.total, 0), orders };
}

// ---------------------------------------------------------------------------
// New outlet from the field
// ---------------------------------------------------------------------------
const outletSchema = z.object({
  shop_name: z.string().trim().min(2, "Enter the shop name"),
  owner_name: z.string().trim().optional(),
  mobile: z.string().regex(/^[6-9][0-9]{9}$/, "Mobile must be a 10-digit number"),
  city: z.string().trim().min(2, "Enter the village / city"),
  address: z.string().trim().optional(),
  pincode: z.string().regex(/^([1-9][0-9]{5})?$/, "PIN code must be 6 digits").optional(),
  gstin: z.string().regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "GSTIN format is not valid").optional(),
  route_id: z.string().guid().optional().or(z.literal("")),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  force: z.boolean().optional(),
});

export async function addOutlet(input: z.input<typeof outletSchema>): Promise<{ id?: string; error?: string; similar?: { code: string; shop_name: string; city: string | null }[] }> {
  const { user, profile } = await requireRole(...FIELD);
  const parsed = outletSchema.safeParse({
    ...input,
    mobile: (input.mobile ?? "").replace(/\D/g, "").slice(-10),
    gstin: (input.gstin ?? "").toUpperCase().replace(/\s/g, "") || undefined,
    pincode: (input.pincode ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();

  const { data: dups } = await supabase.rpc("find_retailer_duplicates", {
    p_mobile: v.mobile, p_gstin: v.gstin ?? null, p_shop_name: v.shop_name, p_city: v.city, p_exclude_id: null,
  });
  const list = (dups ?? []) as { code: string; shop_name: string; city: string | null; reason: string }[];
  const hard = list.find((d) => d.reason !== "Similar shop name");
  if (hard) return { error: `${hard.reason}: ${hard.shop_name} (${hard.code}) is already registered.` };
  if (list.length && !v.force) return { similar: list.map((d) => ({ code: d.code, shop_name: d.shop_name, city: d.city })) };

  const id = crypto.randomUUID();
  const { error } = await supabase.from("retailers").insert({
    id,
    shop_name: v.shop_name,
    owner_name: v.owner_name || null,
    mobile: v.mobile,
    gstin: v.gstin || null,
    billing_city: v.city,
    billing_address: v.address || null,
    billing_pincode: v.pincode || null,
    salesman_id: profile.role === "salesman" ? user.id : null,
    route_id: v.route_id || null,
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/m/outlets");
  revalidatePath("/retailers");
  return { id };
}
