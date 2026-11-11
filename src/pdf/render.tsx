import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { registerFonts, type Company } from "./base";
import { InvoicePdf, type InvoicePdfData } from "./invoice";
import { DeliveryNotePdf, PickingPdf, PurchasePdf, ReceiptPdf, StatementPdf, type PurchasePdfData } from "./documents";

import type { PdfKind } from "./kinds";
import { getCompanyLogoFile } from "@/lib/branding";
import { brandTone } from "@/lib/brand-style";
export type { PdfKind };

export type RenderedPdf = { buffer: Buffer; filename: string; phone?: string; shareText: string };

const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "_");

async function company(): Promise<Company> {
  const supabase = await createClient();
  const [{ data }, logo] = await Promise.all([
    supabase
      .from("company_settings")
      .select("legal_name, gstin, state_code, address, phone, email, bank_details, invoice_terms")
      .eq("id", 1)
      .single(),
    getCompanyLogoFile(),
  ]);
  return { ...(data as Company), logo };
}

// Brand shown on sales documents (name, colour, logo). The seller stays APEX TRADING CO.
async function brandInfo(supabase: Awaited<ReturnType<typeof createClient>>, brandId: string | null | undefined): Promise<InvoicePdfData["brand"]> {
  if (!brandId) return undefined;
  const { data: b } = await supabase.from("brands").select("name, code, logo_path").eq("id", brandId).maybeSingle();
  if (!b) return undefined;
  let logo: { data: Buffer; format: "png" | "jpg" } | null = null;
  if (b.logo_path && /\.(png|jpe?g)$/i.test(b.logo_path)) {
    const { data: blob } = await supabase.storage.from("product-images").download(b.logo_path);
    if (blob) logo = { data: Buffer.from(await blob.arrayBuffer()), format: /\.png$/i.test(b.logo_path) ? "png" : "jpg" };
  }
  return { name: b.name, color: brandTone(b.code).hex, logo };
}

const INV_LINE_COLS =
  "id, line_no, product_name, sku, hsn_code, unit_code, qty, unit_price, price_mode, discount_pct, taxable_value, gst_rate, cgst, sgst, igst, line_total";

// Loads data with the caller's permissions (RLS), then renders. Returns null if not visible.
export async function renderPdf(kind: PdfKind, id: string, params: URLSearchParams = new URLSearchParams()): Promise<RenderedPdf | null> {
  registerFonts();
  const supabase = await createClient();
  const co = await company();

  if (kind === "invoice") {
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
    if (!inv) return null;
    const [{ data: lines }, { data: bal }] = await Promise.all([
      supabase.from("invoice_lines").select(INV_LINE_COLS).eq("invoice_id", id).order("line_no"),
      supabase.from("invoice_balances").select("balance").eq("invoice_id", id).maybeSingle(),
    ]);
    const data = { company: co, invoice: inv, lines: lines ?? [], balance: bal?.balance, brand: await brandInfo(supabase, inv.brand_id) } as InvoicePdfData;
    const buffer = await renderToBuffer(<InvoicePdf data={data} />);
    const snap = inv.retailer_snapshot as { shop_name: string; mobile: string };
    return {
      buffer,
      filename: `${safe(inv.invoice_no)}.pdf`,
      phone: snap.mobile,
      shareText: `Dear ${snap.shop_name}, your invoice ${inv.invoice_no} for ₹${Number(inv.grand_total).toLocaleString("en-IN")} is due on ${new Date(inv.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}. — ${co.legal_name}`,
    };
  }

  if (kind === "credit-note") {
    const { data: cn } = await supabase.from("credit_notes").select("*").eq("id", id).maybeSingle();
    if (!cn) return null;
    const [{ data: inv }, { data: cls }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", cn.invoice_id).single(),
      supabase.from("credit_note_lines").select("invoice_line_id, qty, taxable_value, cgst, sgst, igst, line_total").eq("credit_note_id", id),
    ]);
    const lineIds = (cls ?? []).map((c) => c.invoice_line_id);
    const { data: ils } = lineIds.length ? await supabase.from("invoice_lines").select(INV_LINE_COLS).in("id", lineIds) : { data: [] };
    const ilMap = new Map((ils ?? []).map((l) => [l.id as string, l]));
    const lines = (cls ?? []).map((c, i) => {
      const il = ilMap.get(c.invoice_line_id)!;
      return { ...il, line_no: i + 1, qty: c.qty, discount_pct: 0, taxable_value: c.taxable_value, cgst: c.cgst, sgst: c.sgst, igst: c.igst, line_total: c.line_total };
    });
    const data = {
      company: co,
      brand: await brandInfo(supabase, cn.brand_id ?? inv?.brand_id),
      title: "CREDIT NOTE",
      invoice: {
        ...inv,
        invoice_no: `${cn.credit_note_no} (against ${inv.invoice_no})`,
        invoice_date: cn.note_date,
        subtotal: cn.taxable_total,
        discount_total: 0,
        taxable_total: cn.taxable_total,
        cgst_total: cn.cgst_total,
        sgst_total: cn.sgst_total,
        igst_total: cn.igst_total,
        round_off: 0,
        grand_total: cn.grand_total,
        status: cn.status,
        cancel_reason: cn.reason,
      },
      lines,
    } as InvoicePdfData;
    const buffer = await renderToBuffer(<InvoicePdf data={data} />);
    const snap = inv.retailer_snapshot as { shop_name: string; mobile: string };
    return { buffer, filename: `${safe(cn.credit_note_no)}.pdf`, phone: snap.mobile, shareText: `Credit note ${cn.credit_note_no} for ₹${Number(cn.grand_total).toLocaleString("en-IN")} against invoice ${inv.invoice_no}. — ${co.legal_name}` };
  }

  if (kind === "receipt") {
    const { data: p } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
    if (!p) return null;
    const [{ data: r }, { data: allocs }, { data: who }] = await Promise.all([
      supabase.from("retailers").select("shop_name, code, mobile, billing_city").eq("id", p.retailer_id).single(),
      supabase.from("payment_allocations").select("amount, invoices(invoice_no, invoice_date)").eq("payment_id", id),
      p.collected_by ? supabase.from("tenant_people").select("full_name").eq("id", p.collected_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const allocations = (allocs ?? []).map((a) => {
      const inv = a.invoices as unknown as { invoice_no: string; invoice_date: string };
      return { invoice_no: inv?.invoice_no ?? "", invoice_date: inv?.invoice_date ?? "", amount: Number(a.amount) };
    });
    const buffer = await renderToBuffer(<ReceiptPdf data={{ company: co, payment: p, retailer: r!, allocations, collectedBy: who?.full_name ?? null }} />);
    return {
      buffer,
      filename: `${safe(p.receipt_no)}.pdf`,
      phone: r?.mobile,
      shareText: `Received with thanks ₹${Number(p.amount).toLocaleString("en-IN")} from ${r?.shop_name} (receipt ${p.receipt_no}). — ${co.legal_name}`,
    };
  }

  if (kind === "statement") {
    const { data: r } = await supabase
      .from("retailers")
      .select("id, shop_name, code, mobile, gstin, billing_address, billing_city, credit_days, credit_limit")
      .eq("id", id)
      .maybeSingle();
    if (!r) return null;
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const to = params.get("to") || today;
    const from = params.get("from") || new Date(Date.parse(to) - 90 * 864e5).toISOString().slice(0, 10);
    const [{ data: before }, { data: entries }, { data: open }, { data: bal }] = await Promise.all([
      supabase.from("retailer_ledger").select("debit, credit").eq("retailer_id", id).lt("entry_date", from),
      supabase.from("retailer_ledger").select("entry_date, doc_no, narration, debit, credit, created_at").eq("retailer_id", id)
        .gte("entry_date", from).lte("entry_date", to).order("entry_date").order("created_at"),
      supabase.from("invoice_balances").select("invoice_no, invoice_date, due_date, balance, days_past_due").eq("retailer_id", id).gt("balance", 0).order("due_date"),
      supabase.from("retailer_balances").select("*").eq("retailer_id", id).maybeSingle(),
    ]);
    const opening = (before ?? []).reduce((t, e) => t + Number(e.debit) - Number(e.credit), 0);
    const buffer = await renderToBuffer(
      <StatementPdf
        data={{
          company: co,
          retailer: r,
          from,
          to,
          opening,
          entries: (entries ?? []).map((e) => ({ ...e, debit: Number(e.debit), credit: Number(e.credit) })),
          openInvoices: (open ?? []).map((o) => ({ ...o, balance: Number(o.balance), days_past_due: Number(o.days_past_due) })),
          summary: {
            outstanding: Number(bal?.outstanding ?? 0),
            not_yet_due: Number(bal?.not_yet_due ?? 0),
            overdue: Number(bal?.overdue ?? 0) + Number(bal?.due_today ?? 0),
            b0: Number(bal?.overdue_0_15 ?? 0),
            b16: Number(bal?.overdue_16_30 ?? 0),
            b31: Number(bal?.overdue_31_45 ?? 0),
            b45: Number(bal?.overdue_45_plus ?? 0),
          },
        }}
      />
    );
    return {
      buffer,
      filename: `Statement_${safe(r.code)}_${to}.pdf`,
      phone: r.mobile,
      shareText: `Dear ${r.shop_name}, your account statement up to ${to}: outstanding ₹${Number(bal?.outstanding ?? 0).toLocaleString("en-IN")}. — ${co.legal_name}`,
    };
  }

  if (kind === "delivery-note") {
    const ids = id.split(",").filter(Boolean).slice(0, 50);
    const { data: invs } = await supabase.from("invoices").select("id, invoice_no, invoice_date, retailer_snapshot, brand_id, status").in("id", ids);
    const open = (invs ?? []).filter((i) => i.status !== "cancelled");
    if (!open.length) return null;
    const [{ data: lines }, { data: brands }] = await Promise.all([
      supabase.from("invoice_lines").select("invoice_id, line_no, product_name, sku, hsn_code, unit_code, qty").in("invoice_id", open.map((i) => i.id)).order("line_no"),
      supabase.from("brands").select("id, name"),
    ]);
    const brandName = new Map((brands ?? []).map((b) => [b.id as string, b.name as string]));
    const order = new Map(ids.map((x, i) => [x, i]));
    const notes = [...open].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((i) => {
      const r = i.retailer_snapshot as { shop_name: string; owner_name: string | null; mobile: string | null; code: string | null;
        billing_address: string | null; billing_city: string | null; billing_pincode: string | null;
        delivery_address: string | null; delivery_city: string | null; delivery_pincode: string | null };
      return {
        invoice_no: i.invoice_no as string,
        invoice_date: i.invoice_date as string,
        brand: i.brand_id ? brandName.get(i.brand_id) ?? null : null,
        shop: {
          shop_name: r.shop_name, owner_name: r.owner_name, mobile: r.mobile, code: r.code,
          address: r.delivery_address ?? r.billing_address, city: r.delivery_city ?? r.billing_city, pincode: r.delivery_pincode ?? r.billing_pincode,
        },
        lines: (lines ?? []).filter((l) => l.invoice_id === i.id).map((l) => ({
          product_name: l.product_name as string, sku: l.sku as string, hsn_code: l.hsn_code as string | null, unit_code: l.unit_code as string, qty: Number(l.qty),
        })),
      };
    });
    const buffer = await renderToBuffer(<DeliveryNotePdf data={{ company: co, notes }} />);
    const first = notes[0];
    const one = notes.length === 1;
    const snap = open[0].retailer_snapshot as { mobile?: string };
    return {
      buffer,
      filename: one ? `Delivery_note_${safe(first.invoice_no)}.pdf` : `Delivery_notes_${new Date().toISOString().slice(0, 10)}.pdf`,
      phone: one ? snap.mobile ?? undefined : undefined,
      shareText: one ? `Dear ${first.shop.shop_name}, delivery note for invoice ${first.invoice_no}. — ${co.legal_name}` : "Delivery notes",
    };
  }

  if (kind === "picking") {
    const ids = id.split(",").filter(Boolean).slice(0, 50);
    const { data: invs } = await supabase.from("invoices").select("id, invoice_no, retailer_snapshot").in("id", ids);
    if (!invs?.length) return null;
    const { data: lines } = await supabase.from("invoice_lines").select("invoice_id, product_id, product_name, sku, unit_code, qty").in("invoice_id", ids);
    const pIds = [...new Set((lines ?? []).map((l) => l.product_id as string))];
    const { data: cat } = pIds.length ? await supabase.from("catalog").select("id, default_location_id").in("id", pIds) : { data: [] };
    const locIds = (cat ?? []).map((c) => c.default_location_id).filter(Boolean) as string[];
    const { data: locs } = locIds.length ? await supabase.from("warehouse_locations").select("id, code").in("id", locIds) : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id as string, l.code as string]));
    const rackOf = new Map((cat ?? []).map((c) => [c.id as string, c.default_location_id ? locMap.get(c.default_location_id) ?? null : null]));
    const invNo = new Map(invs.map((i) => [i.id as string, i.invoice_no as string]));
    const grouped = new Map<string, { rack: string | null; product_name: string; sku: string; unit_code: string; qty: number; invoices: Set<string> }>();
    for (const l of lines ?? []) {
      const g = grouped.get(l.product_id) ?? { rack: rackOf.get(l.product_id) ?? null, product_name: l.product_name, sku: l.sku, unit_code: l.unit_code, qty: 0, invoices: new Set<string>() };
      g.qty += Number(l.qty);
      g.invoices.add((invNo.get(l.invoice_id) ?? "").split("/").pop() ?? "");
      grouped.set(l.product_id, g);
    }
    const items = [...grouped.values()]
      .map((g) => ({ ...g, invoices: [...g.invoices].join(", ") }))
      .sort((a, b) => (a.rack ?? "~").localeCompare(b.rack ?? "~") || a.product_name.localeCompare(b.product_name));
    const { data: wh } = await supabase.from("warehouses").select("name").eq("id", params.get("warehouse") ?? "").maybeSingle();
    const buffer = await renderToBuffer(
      <PickingPdf
        data={{
          company: co,
          warehouse: wh?.name ?? "Warehouse",
          invoices: invs.map((i) => {
            const s = i.retailer_snapshot as { shop_name: string; billing_city: string | null };
            return { invoice_no: i.invoice_no, shop_name: s.shop_name, city: s.billing_city };
          }),
          items,
        }}
      />
    );
    return { buffer, filename: `Picking_list_${new Date().toISOString().slice(0, 10)}.pdf`, shareText: "Picking list" };
  }

  if (kind === "quotation") {
    const { data: o } = await supabase
      .from("orders")
      .select("*, retailers(code, shop_name, owner_name, mobile, gstin, billing_address, billing_city, billing_pincode, billing_state_code, delivery_address, delivery_city, delivery_pincode)")
      .eq("id", id)
      .maybeSingle();
    if (!o) return null;
    const [{ data: lines }, { data: sm }] = await Promise.all([
      supabase.from("order_lines").select("line_no, product_id, qty, unit_price, price_mode, discount_pct, taxable_value, gst_rate, tax_amount, line_total").eq("order_id", id).order("line_no"),
      o.salesman_id ? supabase.from("tenant_people").select("full_name").eq("id", o.salesman_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    // Product details come from the catalogue view: salesmen cannot read the products table (it holds costs).
    const pids = [...new Set((lines ?? []).map((l) => l.product_id as string))];
    const { data: prods } = pids.length ? await supabase.from("catalog").select("id, name, sku, hsn_code, unit_code").in("id", pids) : { data: [] };
    const pMap = new Map((prods ?? []).map((p) => [p.id as string, p]));
    const r = o.retailers as unknown as Record<string, string | null>;
    const igst = (r.billing_state_code ?? co.state_code) !== (co.state_code ?? "27");
    const split = (tax: number) => (igst ? { cgst: 0, sgst: 0, igst: tax } : { cgst: Math.round((tax / 2) * 100) / 100, sgst: tax - Math.round((tax / 2) * 100) / 100, igst: 0 });
    const qLines = (lines ?? []).map((l) => {
      const pr = pMap.get(l.product_id) ?? { name: "Product", sku: "", hsn_code: null, unit_code: "PCS" };
      return { ...l, product_name: pr.name, sku: pr.sku, hsn_code: pr.hsn_code, unit_code: pr.unit_code, ...split(Number(l.tax_amount)) };
    });
    const created = new Date(new Date(o.created_at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const validUntil = new Date(Date.parse(created) + 7 * 864e5).toISOString().slice(0, 10);
    const tax = qLines.reduce((t, l) => ({ cgst: t.cgst + l.cgst, sgst: t.sgst + l.sgst, igst: t.igst + l.igst }), { cgst: 0, sgst: 0, igst: 0 });
    const data = {
      company: co,
      brand: await brandInfo(supabase, o.brand_id),
      quotation: { validUntil, salesman: (sm as { full_name: string } | null)?.full_name ?? null },
      invoice: {
        invoice_no: o.order_no,
        invoice_date: created,
        due_date: validUntil,
        credit_days: o.credit_days,
        place_of_supply: r.billing_state_code ?? co.state_code,
        is_igst: igst,
        retailer_snapshot: { ...r, state_code: r.billing_state_code },
        subtotal: o.subtotal,
        discount_total: o.discount_total,
        taxable_total: o.taxable_total,
        cgst_total: tax.cgst,
        sgst_total: tax.sgst,
        igst_total: tax.igst,
        round_off: o.round_off,
        grand_total: o.grand_total,
        status: o.status === "cancelled" ? "cancelled" : "issued",
        cancel_reason: o.cancel_reason,
      },
      lines: qLines,
    } as unknown as InvoicePdfData;
    const buffer = await renderToBuffer(<InvoicePdf data={data} />);
    return {
      buffer,
      filename: `Quotation_${safe(o.order_no)}.pdf`,
      phone: r.mobile ?? undefined,
      shareText: `Dear ${r.shop_name}, here is your quotation ${o.order_no} for ₹${Number(o.grand_total).toLocaleString("en-IN")} (incl. GST), valid until ${new Date(validUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}. Thank you for your order. — ${co.legal_name}`,
    };
  }

  if (kind === "purchase-order") {
    const { data: p } = await supabase.from("purchases").select("*, suppliers(name, gstin, address, city, mobile), warehouses(name, address)").eq("id", id).maybeSingle();
    if (!p) return null;
    const { data: lines } = await supabase
      .from("purchase_lines")
      .select("qty, unit_cost, cost_mode, discount_pct, taxable_value, gst_rate, line_total, products(name, sku, hsn_code, unit_code)")
      .eq("purchase_id", id)
      .order("line_no");
    const sup = p.suppliers as unknown as PurchasePdfData["supplier"];
    const data: PurchasePdfData = {
      company: co,
      purchase: p as PurchasePdfData["purchase"],
      supplier: sup,
      warehouse: p.warehouses as unknown as PurchasePdfData["warehouse"],
      lines: (lines ?? []).map((l) => {
        const pr = l.products as unknown as { name: string; sku: string; hsn_code: string | null; unit_code: string };
        return { ...l, product_name: pr.name, sku: pr.sku, hsn_code: pr.hsn_code, unit_code: pr.unit_code } as PurchasePdfData["lines"][number];
      }),
    };
    const buffer = await renderToBuffer(<PurchasePdf data={data} />);
    return {
      buffer,
      filename: `${safe(p.purchase_no)}.pdf`,
      phone: sup.mobile ?? undefined,
      shareText: p.status === "received"
        ? `${sup.name}: our purchase record ${p.purchase_no} for your bill ${p.supplier_bill_no}. — ${co.legal_name}`
        : `Dear ${sup.name}, please find our purchase order ${p.purchase_no}${p.expected_date ? `, required by ${new Date(p.expected_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}. — ${co.legal_name}`,
    };
  }

  return null;
}
