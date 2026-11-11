import { Document, Page, Text, View } from "@react-pdf/renderer";
import { CompanyHeader, Footer, TableHead, TableRow, d, money, num, s, MUTED, ACCENT, type Col, type Company } from "./base";
import { amountInWords } from "@/lib/gst";

// ---------------------------------------------------------------------------
// Payment receipt
// ---------------------------------------------------------------------------
export type ReceiptPdfData = {
  company: Company;
  payment: { receipt_no: string; payment_date: string; amount: number; method: string; reference_no: string | null; cheque_date: string | null; bank_name: string | null; status: string; notes: string | null };
  retailer: { shop_name: string; code: string; mobile: string; billing_city: string | null };
  allocations: { invoice_no: string; invoice_date: string; amount: number }[];
  collectedBy: string | null;
};

const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", cheque: "Cheque" };

export function ReceiptPdf({ data }: { data: ReceiptPdfData }) {
  const { company, payment: p, retailer: r } = data;
  const allocated = data.allocations.reduce((t, a) => t + Number(a.amount), 0);
  const cols: Col[] = [{ label: "Invoice", w: 2 }, { label: "Invoice date", w: 1.3 }, { label: "Amount applied", w: 1.3, right: true }];
  return (
    <Document title={p.receipt_no}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <CompanyHeader company={company} title="PAYMENT RECEIPT" subtitle={p.receipt_no} />
        <View style={[s.row, { gap: 10, marginBottom: 10 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.small, s.muted]}>RECEIVED FROM</Text>
            <Text style={s.h2}>{r.shop_name}</Text>
            <Text>{r.code} · {r.mobile}{r.billing_city ? ` · ${r.billing_city}` : ""}</Text>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.small, s.muted]}>AMOUNT</Text>
            <Text style={{ fontSize: 16, fontWeight: 700, color: ACCENT }}>{money(p.amount)}</Text>
            <Text style={s.small}>{amountInWords(Number(p.amount))}</Text>
          </View>
        </View>
        <View style={[s.row, { gap: 18, marginBottom: 10 }]}>
          <Text>Date: <Text style={s.bold}>{d(p.payment_date)}</Text></Text>
          <Text>Mode: <Text style={s.bold}>{METHOD[p.method] ?? p.method}</Text></Text>
          {p.reference_no && <Text>Ref: <Text style={s.bold}>{p.reference_no}</Text></Text>}
          {p.bank_name && <Text>Bank: {p.bank_name}</Text>}
          {p.cheque_date && <Text>Cheque date: {d(p.cheque_date)}</Text>}
        </View>
        {p.status === "cheque_pending" && <Text style={{ color: "#b45309", marginBottom: 6 }}>Cheque subject to realisation.</Text>}
        {p.status === "bounced" && <Text style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 6 }}>CHEQUE BOUNCED — this receipt is void.</Text>}
        {p.status === "cancelled" && <Text style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 6 }}>CANCELLED — this receipt is void.</Text>}
        {data.allocations.length > 0 && (
          <>
            <TableHead cols={cols} />
            {data.allocations.map((a, i) => <TableRow key={i} cols={cols} cells={[a.invoice_no, d(a.invoice_date), money(a.amount)]} />)}
          </>
        )}
        {Number(p.amount) - allocated > 0.009 && (
          <Text style={{ marginTop: 6 }}>Kept as advance (not yet applied): <Text style={s.bold}>{money(Number(p.amount) - allocated)}</Text></Text>
        )}
        <View style={[s.row, { justifyContent: "space-between", marginTop: 24 }]}>
          <Text style={s.muted}>{data.collectedBy ? `Collected by ${data.collectedBy}` : ""}</Text>
          <Text style={s.small}>For {company.legal_name}</Text>
        </View>
        <Footer note={`${p.receipt_no} · Computer generated receipt.`} />
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Account statement
// ---------------------------------------------------------------------------
export type StatementPdfData = {
  company: Company;
  retailer: { shop_name: string; code: string; mobile: string; gstin: string | null; billing_address: string | null; billing_city: string | null; credit_days: number; credit_limit: number };
  from: string;
  to: string;
  opening: number;
  entries: { entry_date: string; doc_no: string; narration: string; debit: number; credit: number }[];
  openInvoices: { invoice_no: string; invoice_date: string; due_date: string; balance: number; days_past_due: number }[];
  summary: { outstanding: number; not_yet_due: number; overdue: number; b0: number; b16: number; b31: number; b45: number };
};

export function StatementPdf({ data }: { data: StatementPdfData }) {
  const { company, retailer: r } = data;
  const cols: Col[] = [
    { label: "Date", w: 1 }, { label: "Document", w: 1.6 }, { label: "Details", w: 2.6 },
    { label: "Debit", w: 1.1, right: true }, { label: "Credit", w: 1.1, right: true }, { label: "Balance", w: 1.2, right: true },
  ];
  let bal = data.opening;
  const openCols: Col[] = [{ label: "Invoice", w: 1.8 }, { label: "Date", w: 1.1 }, { label: "Due", w: 1.1 }, { label: "Status", w: 1.3 }, { label: "Balance", w: 1.2, right: true }];
  return (
    <Document title={`Statement ${r.code}`}>
      <Page size="A4" style={s.page}>
        <CompanyHeader company={company} title="ACCOUNT STATEMENT" subtitle={`${d(data.from)} to ${d(data.to)}`} />
        <View style={[s.row, { gap: 8, marginBottom: 10 }]}>
          <View style={[s.box, { flex: 1.4 }]}>
            <Text style={s.h2}>{r.shop_name}</Text>
            <Text>{r.code} · {r.mobile}</Text>
            {r.billing_address && <Text>{r.billing_address}{r.billing_city ? `, ${r.billing_city}` : ""}</Text>}
            <Text>GSTIN: {r.gstin ?? "Unregistered"}</Text>
            <Text style={s.muted}>Credit: {r.credit_days} days{Number(r.credit_limit) > 0 ? ` · limit ${money(r.credit_limit, false)}` : ""}</Text>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Sum k="Total outstanding" v={money(data.summary.outstanding)} strong />
            <Sum k="Not yet due" v={money(data.summary.not_yet_due)} />
            <Sum k="Overdue" v={money(data.summary.overdue)} red={data.summary.overdue > 0} />
            <Sum k="  0–15 days" v={money(data.summary.b0)} />
            <Sum k="  16–30 days" v={money(data.summary.b16)} />
            <Sum k="  31–45 days" v={money(data.summary.b31)} />
            <Sum k="  45+ days" v={money(data.summary.b45)} />
          </View>
        </View>

        <TableHead cols={cols} />
        <TableRow cols={cols} cells={[d(data.from), "", "Opening balance", "", "", money(data.opening)]} />
        {data.entries.map((e, i) => {
          bal += Number(e.debit) - Number(e.credit);
          return (
            <TableRow key={i} cols={cols} shade={i % 2 === 1}
              cells={[d(e.entry_date), e.doc_no, e.narration, Number(e.debit) ? money(e.debit) : "", Number(e.credit) ? money(e.credit) : "", money(bal)]} />
          );
        })}
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 6 }]}>
          <Text style={[s.bold, { fontSize: 10 }]}>Closing balance: {money(bal)}</Text>
        </View>

        {data.openInvoices.length > 0 && (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={s.h2}>Unpaid invoices</Text>
            <TableHead cols={openCols} />
            {data.openInvoices.map((o, i) => (
              <TableRow key={i} cols={openCols}
                cells={[o.invoice_no, d(o.invoice_date), d(o.due_date), o.days_past_due > 0 ? `Overdue ${o.days_past_due} days` : o.days_past_due === 0 ? "Due today" : "Not yet due", money(o.balance)]} />
            ))}
          </View>
        )}
        <Footer note={`Statement for ${r.shop_name} · generated ${d(new Date().toISOString())}`} />
      </Page>
    </Document>
  );
}

function Sum({ k, v, strong, red }: { k: string; v: string; strong?: boolean; red?: boolean }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", marginBottom: 1.5 }]}>
      <Text style={strong ? s.bold : { color: MUTED }}>{k}</Text>
      <Text style={[strong ? s.bold : {}, red ? { color: "#b91c1c", fontWeight: 700 } : {}]}>{v}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Picking list (one or more invoices), sorted by rack
// ---------------------------------------------------------------------------
export type PickingPdfData = {
  company: Company;
  warehouse: string;
  invoices: { invoice_no: string; shop_name: string; city: string | null }[];
  items: { rack: string | null; product_name: string; sku: string; unit_code: string; qty: number; invoices: string }[];
};

export function PickingPdf({ data }: { data: PickingPdfData }) {
  const cols: Col[] = [
    { label: "Rack", w: 0.9 }, { label: "Product", w: 3 }, { label: "Model", w: 1.3 }, { label: "Qty", w: 0.8, right: true },
    { label: "For invoices", w: 2.2 }, { label: "Picked", w: 0.7 },
  ];
  return (
    <Document title="Picking list">
      <Page size="A4" style={s.page}>
        <CompanyHeader company={data.company} title="PICKING LIST" subtitle={`${data.warehouse} · ${d(new Date().toISOString())}`} />
        <Text style={[s.muted, { marginBottom: 6 }]}>
          {data.invoices.map((i) => `${i.invoice_no} (${i.shop_name}${i.city ? ", " + i.city : ""})`).join("   ·   ")}
        </Text>
        <TableHead cols={cols} />
        {data.items.map((it, i) => (
          <TableRow key={i} cols={cols} shade={i % 2 === 1} cells={[it.rack ?? "—", it.product_name, it.sku, `${num(it.qty)} ${it.unit_code}`, it.invoices, "[   ]"]} />
        ))}
        <View style={[s.row, { justifyContent: "space-between", marginTop: 28 }]}>
          <Text>Picked by: ____________________</Text>
          <Text>Checked by: ____________________</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Delivery note: goods and quantities for one or more invoices, one page each,
// without prices, signed by whoever receives the goods
// ---------------------------------------------------------------------------
export type DeliveryNotePdfData = {
  company: Company;
  notes: {
    invoice_no: string;
    invoice_date: string;
    brand: string | null;
    shop: { shop_name: string; owner_name: string | null; mobile: string | null; code: string | null; address: string | null; city: string | null; pincode: string | null };
    lines: { product_name: string; sku: string; hsn_code: string | null; unit_code: string; qty: number }[];
  }[];
};

export function DeliveryNotePdf({ data }: { data: DeliveryNotePdfData }) {
  const cols: Col[] = [
    { label: "#", w: 0.4 }, { label: "Product", w: 3.6 }, { label: "Model", w: 1.4 }, { label: "HSN", w: 0.9 },
    { label: "Qty", w: 0.9, right: true }, { label: "Received", w: 0.9 },
  ];
  return (
    <Document title="Delivery note" author={data.company.legal_name}>
      {data.notes.map((n) => {
        const totalQty = n.lines.reduce((t, l) => t + Number(l.qty), 0);
        return (
          <Page key={n.invoice_no} size="A4" style={s.page}>
            <CompanyHeader company={data.company} title="DELIVERY NOTE" subtitle={`Against invoice ${n.invoice_no}`} />
            <View style={[s.row, { gap: 8, marginBottom: 10 }]}>
              <View style={[s.box, { flex: 1.5 }]}>
                <Text style={[s.small, s.muted]}>DELIVER TO</Text>
                <Text style={s.h2}>{n.shop.shop_name}</Text>
                {n.shop.owner_name && <Text>{n.shop.owner_name}</Text>}
                {n.shop.address && <Text>{n.shop.address}</Text>}
                <Text>{[n.shop.city, n.shop.pincode].filter(Boolean).join(" - ")}</Text>
                {n.shop.mobile && <Text>Mobile: {n.shop.mobile}</Text>}
                {n.shop.code && <Text style={s.muted}>Retailer ID: {n.shop.code}</Text>}
              </View>
              <View style={[s.box, { flex: 1 }]}>
                <Text style={[s.small, s.muted]}>DETAILS</Text>
                <Text>Invoice: <Text style={s.bold}>{n.invoice_no}</Text></Text>
                <Text>Invoice date: {d(n.invoice_date)}</Text>
                {n.brand && <Text>Brand: {n.brand}</Text>}
                <Text style={{ marginTop: 6 }}>Vehicle no.: __________________</Text>
                <Text style={{ marginTop: 4 }}>Driver / delivered by: _________</Text>
                <Text style={{ marginTop: 4 }}>Packages / boxes: ______________</Text>
              </View>
            </View>
            <TableHead cols={cols} />
            {n.lines.map((l, i) => (
              <TableRow key={i} cols={cols} shade={i % 2 === 1}
                cells={[i + 1, l.product_name, l.sku, l.hsn_code ?? "—", `${num(l.qty)} ${l.unit_code}`, "[   ]"]} />
            ))}
            <View style={[s.row, { justifyContent: "flex-end", marginTop: 6 }]}>
              <Text style={s.bold}>Total quantity: {num(totalQty)} ({n.lines.length} item{n.lines.length === 1 ? "" : "s"})</Text>
            </View>
            <Text style={[s.muted, { marginTop: 10 }]}>
              Prices and taxes are on the tax invoice {n.invoice_no}. Please check the goods on delivery; any shortage or damage must be written below before signing.
            </Text>
            <Text style={{ marginTop: 8 }}>Remarks: ______________________________________________________________________________</Text>
            <View style={[s.row, { justifyContent: "space-between", marginTop: 34, gap: 16 }]}>
              <View style={[s.box, { flex: 1, minHeight: 70 }]}>
                <Text style={[s.small, s.muted]}>RECEIVED THE ABOVE GOODS IN GOOD CONDITION</Text>
                <Text style={{ marginTop: 26 }}>Name: ____________________  Date: __________</Text>
                <Text style={[s.small, s.muted, { marginTop: 4 }]}>{"Receiver's signature and shop stamp"}</Text>
              </View>
              <View style={[s.box, { flex: 1, minHeight: 70, alignItems: "flex-end" }]}>
                <Text style={[s.small, s.muted]}>FOR {data.company.legal_name.toUpperCase()}</Text>
                <Text style={{ marginTop: 34 }}>Authorised signatory</Text>
              </View>
            </View>
            <Footer />
          </Page>
        );
      })}
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Purchase order (to the supplier) / purchase record once received
// ---------------------------------------------------------------------------
export type PurchasePdfData = {
  company: Company;
  purchase: {
    purchase_no: string; status: string; order_date: string; expected_date: string | null; supplier_bill_no: string | null; supplier_bill_date: string | null;
    credit_days: number; is_igst: boolean; subtotal: number; discount_total: number; taxable_total: number; cgst_total: number; sgst_total: number;
    igst_total: number; other_charges: number; round_off: number; grand_total: number; notes: string | null;
  };
  supplier: { name: string; gstin: string | null; address: string | null; city: string | null; mobile: string | null };
  warehouse: { name: string; address: string | null };
  lines: { product_name: string; sku: string; hsn_code: string | null; unit_code: string; qty: number; unit_cost: number; cost_mode: string; discount_pct: number; taxable_value: number; gst_rate: number; line_total: number }[];
};

export function PurchasePdf({ data }: { data: PurchasePdfData }) {
  const p = data.purchase;
  const received = p.status === "received";
  const cols: Col[] = [
    { label: "#", w: 0.35 }, { label: "Product", w: 3 }, { label: "HSN", w: 0.9 }, { label: "Qty", w: 0.8, right: true },
    { label: "Rate", w: 1, right: true }, { label: "Disc.", w: 0.6, right: true }, { label: "Taxable", w: 1.1, right: true },
    { label: "GST", w: 0.55, right: true }, { label: "Amount", w: 1.15, right: true },
  ];
  const tot: [string, string][] = [
    ["Taxable value", money(p.taxable_total)],
    ...(p.is_igst ? [["IGST", money(p.igst_total)] as [string, string]] : [["CGST", money(p.cgst_total)] as [string, string], ["SGST", money(p.sgst_total)] as [string, string]]),
    ...(Number(p.other_charges) > 0 ? [["Other charges", money(p.other_charges)] as [string, string]] : []),
    ...(Number(p.round_off) !== 0 ? [["Round off", money(p.round_off)] as [string, string]] : []),
  ];
  return (
    <Document title={p.purchase_no}>
      <Page size="A4" style={s.page}>
        <CompanyHeader company={data.company} title={received ? "PURCHASE RECORD" : "PURCHASE ORDER"} subtitle={`${p.purchase_no} · ${d(p.order_date)}`} />
        <View style={[s.row, { gap: 10, marginBottom: 10 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.h2}>Supplier</Text>
            <Text style={s.bold}>{data.supplier.name}</Text>
            {data.supplier.address && <Text>{data.supplier.address}</Text>}
            {data.supplier.city && <Text>{data.supplier.city}</Text>}
            {data.supplier.gstin && <Text>GSTIN: {data.supplier.gstin}</Text>}
            {data.supplier.mobile && <Text>Mobile: {data.supplier.mobile}</Text>}
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.h2}>Deliver to</Text>
            <Text style={s.bold}>{data.company.legal_name}</Text>
            <Text>{data.warehouse.name}</Text>
            {data.warehouse.address && <Text>{data.warehouse.address}</Text>}
          </View>
          <View style={[s.box, { flex: 0.9 }]}>
            <Text style={s.h2}>Terms</Text>
            <Text>Payment: {Number(p.credit_days) === 0 ? "on delivery" : `${p.credit_days} days from bill`}</Text>
            {p.expected_date && <Text>Deliver by: {d(p.expected_date)}</Text>}
            {received && <Text>Supplier bill: {p.supplier_bill_no} · {d(p.supplier_bill_date)}</Text>}
            <Text>{p.is_igst ? "IGST (inter-state)" : "CGST + SGST"}</Text>
          </View>
        </View>
        <TableHead cols={cols} />
        {data.lines.map((l, i) => (
          <TableRow key={i} cols={cols} shade={i % 2 === 1} cells={[
            i + 1, `${l.product_name}\n${l.sku}`, l.hsn_code ?? "", `${num(l.qty)} ${l.unit_code}`,
            `${money(l.unit_cost)}${l.cost_mode === "inclusive" ? "*" : ""}`, Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "", money(l.taxable_value),
            `${Number(l.gst_rate)}%`, money(l.line_total),
          ]} />
        ))}
        <View style={[s.row, { justifyContent: "space-between", marginTop: 10 }]}>
          <View style={{ maxWidth: "55%" }}>
            <Text style={s.muted}>Total quantity: {num(data.lines.reduce((t, l) => t + Number(l.qty), 0))}</Text>
            {data.lines.some((l) => l.cost_mode === "inclusive") && <Text style={[s.muted, s.small]}>* rate includes GST</Text>}
            <Text style={{ marginTop: 6 }}>{amountInWords(Number(p.grand_total))}</Text>
            {p.notes && <Text style={[s.muted, { marginTop: 6 }]}>Notes: {p.notes}</Text>}
          </View>
          <View style={{ width: 200 }}>
            {tot.map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 1.5 }]}><Text style={{ color: MUTED }}>{k}</Text><Text>{v}</Text></View>
            ))}
            <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: ACCENT, marginTop: 3, paddingTop: 3 }]}>
              <Text style={s.bold}>Total</Text><Text style={[s.bold, { fontSize: 11 }]}>{money(p.grand_total)}</Text>
            </View>
          </View>
        </View>
        {!received && (
          <View style={[s.row, { justifyContent: "space-between", marginTop: 36 }]}>
            <Text style={s.muted}>Please mention {p.purchase_no} on your invoice.</Text>
            <Text>Authorised signatory: ____________________</Text>
          </View>
        )}
        <Footer />
      </Page>
    </Document>
  );
}
