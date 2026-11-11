import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { LINE, MUTED, num, money, s } from "./base";

export type StockReportData = {
  brand: { name: string; color: string; logo: { data: Buffer; format: "png" | "jpg" } | null };
  company: string;
  companyLogo?: { data: Buffer; format: "png" | "jpg" } | null;
  warehouse: string;
  generatedAt: string;
  generatedBy: string;
  withValue: boolean;
  groups: { category: string; items: { name: string; sku: string; unit: string; qty: number; value: number | null; avgCost: number | null }[] }[];
};

// Print-ready stock list for one brand, grouped by category, with page numbers.
export function StockReportPdf({ data }: { data: StockReportData }) {
  const items = data.groups.flatMap((g) => g.items);
  const totalQty = items.reduce((t, i) => t + i.qty, 0);
  const totalValue = items.reduce((t, i) => t + (i.value ?? 0), 0);
  const c = data.brand.color;
  const cols = data.withValue
    ? [{ l: "Sr.", w: 0.45 }, { l: "Product", w: 4 }, { l: "SKU", w: 1.6 }, { l: "Unit", w: 0.6 }, { l: "Qty", w: 0.9, r: true }, { l: "Avg. cost", w: 1.1, r: true }, { l: "Value", w: 1.3, r: true }]
    : [{ l: "Sr.", w: 0.45 }, { l: "Product", w: 4.6 }, { l: "SKU", w: 1.8 }, { l: "Unit", w: 0.7 }, { l: "Qty", w: 1, r: true }];
  let sr = 0;

  return (
    <Document title={`${data.brand.name} stock report`} author={data.company}>
      <Page size="A4" style={[s.page, { paddingTop: 24, paddingBottom: 46 }]}>
        {/* Header (every page) */}
        <View fixed style={[s.row, { justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: c, paddingBottom: 8, marginBottom: 10 }]}>
          <View style={[s.row, { alignItems: "center" }]}>
            {data.brand.logo
              // eslint-disable-next-line jsx-a11y/alt-text
              ? <Image src={data.brand.logo} style={{ height: 30, maxWidth: 120, objectFit: "contain", marginRight: 10 }} />
              : <View style={{ backgroundColor: c, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 9, marginRight: 10 }}><Text style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{data.brand.name}</Text></View>}
            <View>
              <Text style={{ fontSize: 15, fontWeight: 700 }}>{data.brand.name} Stock Report</Text>
              <Text style={s.muted}>{data.company} · {data.warehouse}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {data.companyLogo && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.companyLogo} style={{ height: 22, maxWidth: 110, objectFit: "contain", objectPosition: "right", marginBottom: 3 }} />
            )}
            <Text style={s.muted}>Generated</Text>
            <Text style={s.bold}>{data.generatedAt}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={[s.row, { marginBottom: 12 }]}>
          {[["Products", String(items.length)], ["Total stock qty", num(totalQty)], ...(data.withValue ? [["Inventory value (excl. GST)", money(totalValue, false)]] : []), ["Categories", String(data.groups.length)]].map(([k, v]) => (
            <View key={k} style={{ flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, marginRight: 6 }}>
              <Text style={[s.muted, s.small]}>{k}</Text>
              <Text style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Table head (repeats on every page) */}
        <View style={s.row} fixed>
          {cols.map((col) => <Text key={col.l} style={[s.th, { flex: col.w, backgroundColor: "#e2e8f0" }, col.r ? s.right : {}]}>{col.l}</Text>)}
        </View>

        {data.groups.map((g) => {
          const gQty = g.items.reduce((t, i) => t + i.qty, 0);
          const gVal = g.items.reduce((t, i) => t + (i.value ?? 0), 0);
          return (
            <View key={g.category}>
              <View style={[s.row, { backgroundColor: "#f8fafc", borderBottomWidth: 1, borderBottomColor: LINE, marginTop: 4 }]} wrap={false}>
                <Text style={{ flex: 1, paddingVertical: 4, paddingHorizontal: 4, fontWeight: 700, color: c }}>{g.category}</Text>
                <Text style={{ paddingVertical: 4, paddingHorizontal: 4, color: MUTED }}>{g.items.length} products · {num(gQty)} units{data.withValue ? ` · ${money(gVal, false)}` : ""}</Text>
              </View>
              {g.items.map((it) => {
                sr += 1;
                const cells = data.withValue
                  ? [String(sr), it.name, it.sku, it.unit, num(it.qty), it.avgCost === null ? "—" : money(it.avgCost), it.value === null ? "—" : money(it.value, false)]
                  : [String(sr), it.name, it.sku, it.unit, num(it.qty)];
                return (
                  <View key={it.sku + sr} style={[s.row, sr % 2 === 0 ? { backgroundColor: "#fcfcfd" } : {}]} wrap={false}>
                    {cols.map((col, i) => <Text key={col.l} style={[s.td, { flex: col.w }, col.r ? s.right : {}, i === 4 ? { fontWeight: 700, color: it.qty <= 0 ? "#b91c1c" : "#0f172a" } : {}]}>{cells[i]}</Text>)}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={[s.row, { borderTopWidth: 1.5, borderTopColor: "#0f172a", marginTop: 6, paddingTop: 5 }]} wrap={false}>
          <Text style={{ flex: 1, fontWeight: 700 }}>Total · {items.length} products</Text>
          <Text style={{ fontWeight: 700, marginRight: 4 }}>{num(totalQty)} units{data.withValue ? `   ·   ${money(totalValue, false)}` : ""}</Text>
        </View>

        <View style={[s.row, { justifyContent: "space-between", marginTop: 26 }]} wrap={false}>
          <Text>Checked by: ______________________</Text>
          <Text>Date: ______________</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>{data.brand.name} inventory · {data.company} · printed by {data.generatedBy}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
