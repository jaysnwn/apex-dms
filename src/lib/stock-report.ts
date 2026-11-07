import "server-only";

import ExcelJS from "exceljs";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { registerFonts } from "@/pdf/base";
import { StockReportPdf, type StockReportData } from "@/pdf/stock-report";
import { brandTone } from "@/lib/brand-style";
import { fetchAll } from "@/lib/reports";

type Opts = { brandId: string; warehouseId?: string | null; withValue: boolean; userName: string };
type Item = { id: string; name: string; sku: string; unit: string; category: string; qty: number; avgCost: number | null; value: number | null };

const nowIST = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const todayStamp = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "_");

// Everything both reports need, read with the caller's permissions (RLS + brand access).
async function load(o: Opts) {
  const supabase = await createClient();
  const [{ data: brand }, { data: whs }] = await Promise.all([
    supabase.from("brands").select("id, name, code, logo_path").eq("id", o.brandId).maybeSingle(),
    supabase.from("warehouses").select("id, name").eq("brand_id", o.brandId).order("name"),
  ]);
  const { data: allowed } = await supabase.rpc("can_access_brand", { p_brand: o.brandId });
  if (!brand || !allowed) return null;
  const wh = o.warehouseId ? (whs ?? []).find((w) => w.id === o.warehouseId) : null;
  if (o.warehouseId && !wh) return null;

  const [products, onHand, val] = await Promise.all([
    fetchAll<{ id: string; name: string; sku: string; unit_code: string; category_name: string | null }>(() => supabase.from("catalog").select("id, name, sku, unit_code, category_name").eq("brand_id", o.brandId).eq("is_active", true).order("name")),
    fetchAll<{ product_id: string; warehouse_id: string; on_hand: number }>(() => supabase.from("stock_on_hand").select("product_id, warehouse_id, on_hand").in("warehouse_id", (whs ?? []).map((w) => w.id))),
    o.withValue ? fetchAll<{ product_id: string; avg_cost: number }>(() => supabase.from("inventory_valuation").select("product_id, avg_cost").eq("brand_id", o.brandId)) : Promise.resolve([]),
  ]);
  const qty = new Map<string, number>();
  for (const r of onHand) if (!wh || r.warehouse_id === wh.id) qty.set(r.product_id as string, (qty.get(r.product_id as string) ?? 0) + Number(r.on_hand));
  const cost = new Map(val.map((v) => [v.product_id, Number(v.avg_cost)]));
  const items: Item[] = products.map((p) => {
    const q = qty.get(p.id) ?? 0;
    const c = o.withValue ? cost.get(p.id) ?? null : null;
    return { id: p.id, name: p.name, sku: p.sku, unit: p.unit_code, category: p.category_name ?? "Uncategorised", qty: q, avgCost: c, value: c === null ? null : Math.round(q * c * 100) / 100 };
  });
  const { data: co } = await supabase.from("company_settings").select("legal_name").eq("id", 1).single();
  return { supabase, brand, warehouseName: wh?.name ?? ((whs ?? []).length > 1 ? "All warehouses" : (whs ?? [])[0]?.name ?? ""), items, company: (co?.legal_name as string) ?? "APEX TRADING CO." };
}

export async function stockReportPdf(o: Opts) {
  const d = await load(o);
  if (!d) return null;
  registerFonts();
  let logo: StockReportData["brand"]["logo"] = null;
  if (d.brand.logo_path && /\.(png|jpe?g)$/i.test(d.brand.logo_path)) {
    const { data: blob } = await d.supabase.storage.from("product-images").download(d.brand.logo_path);
    if (blob) logo = { data: Buffer.from(await blob.arrayBuffer()), format: /\.png$/i.test(d.brand.logo_path) ? "png" : "jpg" };
  }
  const byCat = new Map<string, Item[]>();
  for (const it of d.items) byCat.set(it.category, [...(byCat.get(it.category) ?? []), it]);
  const groups = [...byCat.entries()].sort(([a], [b]) => (a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b)))
    .map(([category, items]) => ({ category, items: [...items].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" })).map((i) => ({ name: i.name, sku: i.sku, unit: i.unit, qty: i.qty, value: i.value, avgCost: i.avgCost })) }));
  const data: StockReportData = {
    brand: { name: d.brand.name, color: brandTone(d.brand.code).hex, logo },
    company: d.company, warehouse: d.warehouseName, generatedAt: nowIST(), generatedBy: o.userName, withValue: o.withValue, groups,
  };
  const buffer = await renderToBuffer(createElement(StockReportPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
  return { buffer, filename: `${safe(d.brand.name)}-Stock-Report-${todayStamp()}${o.withValue ? "-with-value" : ""}.pdf` };
}

// Stock verification sheet: exactly six columns, Difference = Physical − System.
export async function stockVerificationXlsx(o: Opts) {
  const d = await load({ ...o, withValue: false });
  if (!d) return null;
  const buffer = await buildVerificationWorkbook({ brand: d.brand.name, company: d.company, warehouse: d.warehouseName, date: todayStamp(), items: d.items });
  return { buffer, filename: `${safe(d.brand.name)}-Stock-Verification-${todayStamp()}.xlsx` };
}

export async function buildVerificationWorkbook(m: { brand: string; company: string; warehouse: string; date: string; items: { name: string; qty: number }[] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = m.company;
  wb.created = new Date();
  const ws = wb.addWorksheet(`${m.brand} Verification`.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 }, printTitlesRow: "1:1", horizontalCentered: true,
    },
    headerFooter: {
      oddHeader: `&L&"-,Bold"&12${m.brand} Stock Verification&R&10${m.warehouse} · ${m.date}`,
      oddFooter: "&LCounted by: ______________     Checked by: ______________&RPage &P of &N",
    },
  });
  ws.columns = [
    { header: "Sr. No.", key: "sr", width: 8 },
    { header: "Product Name", key: "name", width: 50 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Physical Qty", key: "physical", width: 14 },
    { header: "Difference", key: "diff", width: 13 },
    { header: "Notes", key: "notes", width: 32 },
  ];
  const border = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((c) => {
    c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = border;
  });

  const items = [...m.items].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
  items.forEach((it, i) => {
    const r = i + 2;
    const row = ws.addRow({ sr: i + 1, name: it.name, qty: it.qty, physical: null, diff: { formula: `IF(D${r}="","",D${r}-C${r})` }, notes: null });
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = border;
      c.alignment = { vertical: "middle", horizontal: col === 2 || col === 6 ? "left" : "center", wrapText: col === 2 };
      if (col === 3 || col === 4 || col === 5) c.numFmt = "#,##0.###;-#,##0.###;0";
      if (col === 4) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
        c.dataValidation = { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: "Physical Qty", error: "Enter the counted quantity (0 or more)." };
      }
    });
    row.getCell(5).font = { bold: true };
  });
  const last = items.length + 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: 6 } };
  if (items.length) {
    ws.addConditionalFormatting({
      ref: `E2:E${last}`,
      rules: [
        { type: "expression", priority: 1, formulae: [`AND(E2<>"",E2<0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFECACA" } }, font: { color: { argb: "FF991B1B" }, bold: true } } },
        { type: "expression", priority: 2, formulae: [`AND(E2<>"",E2>0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFBBF7D0" } }, font: { color: { argb: "FF166534" }, bold: true } } },
      ],
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
