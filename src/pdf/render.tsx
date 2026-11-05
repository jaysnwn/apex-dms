import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { registerFonts, type Company } from "./base";
import { InvoicePdf, type InvoicePdfData } from "./invoice";
import { PickingPdf, ReceiptPdf, StatementPdf } from "./documents";

import type { PdfKind } from "./kinds";
export type { PdfKind };

export type RenderedPdf = { buffer: Buffer; filename: string; phone?: string; shareText: string };

const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "_");

async function company(): Promise<Company> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_settings")
    .select("legal_name, gstin, state_code, address, phone, email, bank_details, invoice_terms")
    .eq("id", 1)
    .single();
  return data as Company;
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
    const data = { company: co, invoice: inv, lines: lines ?? [], balance: bal?.balance } as InvoicePdfData;
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
      p.collected_by ? supabase.from("profiles").select("full_name").eq("id", p.collected_by).maybeSingle() : Promise.resolve({ data: null }),
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

  return null;
}
