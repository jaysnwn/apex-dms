import { Document, Page, Text, View } from "@react-pdf/renderer";
import { CompanyHeader, Footer, TableHead, TableRow, d, money, num, s, MUTED, ACCENT, type Col, type Company } from "./base";
import { amountInWords } from "@/lib/gst";
import { GST_STATES } from "@/lib/states";

export type InvoicePdfData = {
  company: Company;
  invoice: {
    invoice_no: string;
    invoice_date: string;
    due_date: string;
    credit_days: number;
    place_of_supply: string;
    is_igst: boolean;
    retailer_snapshot: Record<string, string | null>;
    subtotal: number;
    discount_total: number;
    taxable_total: number;
    cgst_total: number;
    sgst_total: number;
    igst_total: number;
    round_off: number;
    grand_total: number;
    status: string;
    cancel_reason: string | null;
  };
  lines: {
    line_no: number;
    product_name: string;
    sku: string;
    hsn_code: string | null;
    unit_code: string;
    qty: number;
    unit_price: number;
    price_mode: string;
    discount_pct: number;
    taxable_value: number;
    gst_rate: number;
    cgst: number;
    sgst: number;
    igst: number;
    line_total: number;
  }[];
  balance?: number;
  title?: string;   // "TAX INVOICE" or "CREDIT NOTE"
};

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const { company, invoice: inv, lines } = data;
  const r = inv.retailer_snapshot;
  const cols: Col[] = [
    { label: "#", w: 0.35 },
    { label: "Product", w: 3.2 },
    { label: "HSN", w: 0.9 },
    { label: "Qty", w: 0.7, right: true },
    { label: "Rate", w: 1, right: true },
    { label: "Disc.", w: 0.6, right: true },
    { label: "Taxable", w: 1.1, right: true },
    { label: "GST", w: 0.6, right: true },
    ...(inv.is_igst ? [{ label: "IGST", w: 1, right: true }] : [{ label: "CGST", w: 0.9, right: true }, { label: "SGST", w: 0.9, right: true }]),
    { label: "Amount", w: 1.15, right: true },
  ];

  // HSN-wise tax summary (required on GST invoices)
  const hsn = new Map<string, { taxable: number; rate: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const key = `${l.hsn_code ?? "—"}|${l.gst_rate}`;
    const h = hsn.get(key) ?? { taxable: 0, rate: Number(l.gst_rate), cgst: 0, sgst: 0, igst: 0 };
    h.taxable += Number(l.taxable_value); h.cgst += Number(l.cgst); h.sgst += Number(l.sgst); h.igst += Number(l.igst);
    hsn.set(key, h);
  }

  const totals: [string, string, boolean?][] = [
    ["Subtotal", money(inv.subtotal)],
    ...(Number(inv.discount_total) > 0 ? ([["Discount", "− " + money(inv.discount_total)]] as [string, string][]) : []),
    ["Taxable value", money(inv.taxable_total)],
    ...(inv.is_igst
      ? ([["IGST", money(inv.igst_total)]] as [string, string][])
      : ([["CGST", money(inv.cgst_total)], ["SGST", money(inv.sgst_total)]] as [string, string][])),
    ...(Number(inv.round_off) !== 0 ? ([["Round off", money(inv.round_off)]] as [string, string][]) : []),
    ["Invoice total", money(inv.grand_total), true],
  ];

  return (
    <Document title={`${inv.invoice_no}`} author={company.legal_name}>
      <Page size="A4" style={s.page}>
        <CompanyHeader company={company} title={data.title ?? "TAX INVOICE"} subtitle="Original for recipient" />

        {inv.status === "cancelled" && (
          <View style={{ backgroundColor: "#fee2e2", padding: 6, marginBottom: 8 }}>
            <Text style={{ color: "#b91c1c", fontWeight: 700 }}>CANCELLED{inv.cancel_reason ? ` — ${inv.cancel_reason}` : ""}</Text>
          </View>
        )}

        <View style={[s.row, { gap: 8, marginBottom: 10 }]}>
          <View style={[s.box, { flex: 1.4 }]}>
            <Text style={[s.small, s.muted]}>BILL TO</Text>
            <Text style={s.h2}>{r.shop_name}</Text>
            {r.owner_name && <Text>{r.owner_name}</Text>}
            {r.billing_address && <Text>{r.billing_address}</Text>}
            <Text>{[r.billing_city, r.billing_pincode].filter(Boolean).join(" - ")}</Text>
            <Text>Mobile: {r.mobile}</Text>
            <Text style={s.bold}>GSTIN: {r.gstin ?? "Unregistered"}</Text>
            <Text style={s.muted}>Retailer ID: {r.code}</Text>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.small, s.muted]}>SHIP TO</Text>
            <Text style={s.bold}>{r.shop_name}</Text>
            <Text>{r.delivery_address ?? r.billing_address ?? ""}</Text>
            <Text>{[r.delivery_city ?? r.billing_city, r.delivery_pincode ?? r.billing_pincode].filter(Boolean).join(" - ")}</Text>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Meta k="Invoice no." v={inv.invoice_no} bold />
            <Meta k="Invoice date" v={d(inv.invoice_date)} />
            <Meta k="Credit period" v={`${inv.credit_days} days`} />
            <Meta k="Due date" v={d(inv.due_date)} bold />
            <Meta k="Place of supply" v={`${inv.place_of_supply} ${GST_STATES[inv.place_of_supply] ?? ""}`} />
            <Meta k="Tax type" v={inv.is_igst ? "IGST (inter-state)" : "CGST + SGST"} />
          </View>
        </View>

        <TableHead cols={cols} />
        {lines.map((l, i) => (
          <TableRow
            key={l.line_no}
            cols={cols}
            shade={i % 2 === 1}
            cells={[
              l.line_no,
              `${l.product_name}\n${l.sku}`,
              l.hsn_code ?? "",
              `${num(l.qty)} ${l.unit_code}`,
              money(l.unit_price) + (l.price_mode === "inclusive" ? "*" : ""),
              Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "",
              money(l.taxable_value),
              `${Number(l.gst_rate)}%`,
              ...(inv.is_igst ? [money(l.igst)] : [money(l.cgst), money(l.sgst)]),
              money(l.line_total),
            ]}
          />
        ))}

        <View style={[s.row, { marginTop: 10, gap: 10 }]} wrap={false}>
          <View style={{ flex: 1.5 }}>
            <Text style={[s.small, s.muted]}>AMOUNT IN WORDS</Text>
            <Text style={[s.bold, { marginBottom: 8 }]}>{amountInWords(Number(inv.grand_total))}</Text>

            <Text style={[s.small, s.muted, { marginBottom: 2 }]}>HSN SUMMARY</Text>
            {[...hsn.entries()].map(([key, h]) => (
              <Text key={key} style={s.small}>
                HSN {key.split("|")[0]} @ {h.rate}%: taxable {money(h.taxable)} ·{" "}
                {inv.is_igst ? `IGST ${money(h.igst)}` : `CGST ${money(h.cgst)} · SGST ${money(h.sgst)}`}
              </Text>
            ))}
            {lines.some((l) => l.price_mode === "inclusive") && (
              <Text style={[s.small, s.muted, { marginTop: 4 }]}>* Rate includes GST; taxable value shown after removing GST.</Text>
            )}
            {company.bank_details && (
              <View style={{ marginTop: 8 }}>
                <Text style={[s.small, s.muted]}>BANK DETAILS</Text>
                <Text style={s.small}>{company.bank_details}</Text>
              </View>
            )}
            {company.invoice_terms && (
              <View style={{ marginTop: 8 }}>
                <Text style={[s.small, s.muted]}>TERMS</Text>
                <Text style={s.small}>{company.invoice_terms}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            {totals.map(([k, v, strong]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: strong ? 5 : 2 }, strong ? { borderTopWidth: 1.5, borderTopColor: ACCENT, marginTop: 3 } : {}]}>
                <Text style={strong ? [s.bold, { fontSize: 11 }] : [{ color: MUTED }]}>{k}</Text>
                <Text style={strong ? [s.bold, { fontSize: 11 }] : []}>{v}</Text>
              </View>
            ))}
            {data.balance !== undefined && Number(data.balance) > 0 && Number(data.balance) < Number(inv.grand_total) && (
              <View style={[s.row, { justifyContent: "space-between", paddingVertical: 2 }]}>
                <Text style={{ color: MUTED }}>Balance due</Text>
                <Text style={s.bold}>{money(data.balance)}</Text>
              </View>
            )}
            <View style={{ marginTop: 28, alignItems: "flex-end" }}>
              <Text style={s.small}>For {company.legal_name}</Text>
              <Text style={[s.small, s.muted, { marginTop: 22 }]}>Authorised signatory</Text>
            </View>
          </View>
        </View>
        <Footer note={`${inv.invoice_no} · This is a computer generated invoice.`} />
      </Page>
    </Document>
  );
}

function Meta({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", marginBottom: 1.5 }]}>
      <Text style={s.muted}>{k}</Text>
      <Text style={bold ? s.bold : {}}>{v}</Text>
    </View>
  );
}
