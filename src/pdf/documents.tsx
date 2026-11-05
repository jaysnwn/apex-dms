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
