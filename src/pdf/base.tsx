import { Font, StyleSheet, Text, View } from "@react-pdf/renderer";
import { NOTO_SANS_BOLD, NOTO_SANS_REGULAR } from "./font-data";
import { GST_STATES } from "@/lib/states";

let registered = false;
export function registerFonts() {
  if (registered) return;
  Font.register({
    family: "Noto",
    fonts: [
      { src: NOTO_SANS_REGULAR, fontWeight: 400 },
      { src: NOTO_SANS_BOLD, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

export const INK = "#111a2e";
export const ACCENT = "#d97706";
export const MUTED = "#64748b";
export const LINE = "#e2e8f0";

export const s = StyleSheet.create({
  page: { fontFamily: "Noto", fontSize: 8.5, color: "#0f172a", padding: 28, paddingBottom: 40 },
  row: { flexDirection: "row" },
  h1: { fontSize: 16, fontWeight: 700, color: INK },
  h2: { fontSize: 10, fontWeight: 700, color: INK, marginBottom: 3 },
  muted: { color: MUTED },
  small: { fontSize: 7.5 },
  bold: { fontWeight: 700 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 8 },
  th: { backgroundColor: "#f1f5f9", fontWeight: 700, paddingVertical: 4, paddingHorizontal: 4, fontSize: 7.5, color: "#334155" },
  td: { paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  right: { textAlign: "right" },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 7, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

export const money = (n: number | string | null | undefined, decimals = true) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 });
export const num = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
export const d = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

export type Company = {
  legal_name: string;
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank_details: string | null;
  invoice_terms: string | null;
};

export function CompanyHeader({ company, title, subtitle }: { company: Company; title: string; subtitle?: string }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", marginBottom: 12, borderBottomWidth: 2, borderBottomColor: ACCENT, paddingBottom: 8 }]}>
      <View style={{ maxWidth: "60%" }}>
        <Text style={s.h1}>{company.legal_name}</Text>
        {company.address && <Text style={s.muted}>{company.address}</Text>}
        <Text style={s.muted}>
          {[company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join("  ·  ")}
        </Text>
        <Text style={s.muted}>
          {company.gstin ? `GSTIN: ${company.gstin}` : "GSTIN: not set"}
          {company.state_code ? `  ·  State: ${company.state_code} ${GST_STATES[company.state_code] ?? ""}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{title}</Text>
        {subtitle && <Text style={s.muted}>{subtitle}</Text>}
      </View>
    </View>
  );
}

export function Footer({ note }: { note?: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{note ?? "Computer generated document."}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// Simple table: columns with width (flex) and alignment.
export type Col = { label: string; w: number; right?: boolean };
export function TableHead({ cols }: { cols: Col[] }) {
  return (
    <View style={s.row} fixed>
      {cols.map((c) => (
        <Text key={c.label} style={[s.th, { flex: c.w }, c.right ? s.right : {}]}>{c.label}</Text>
      ))}
    </View>
  );
}
export function TableRow({ cols, cells, shade }: { cols: Col[]; cells: (string | number)[]; shade?: boolean }) {
  return (
    <View style={[s.row, shade ? { backgroundColor: "#fafafa" } : {}]} wrap={false}>
      {cols.map((c, i) => (
        <Text key={c.label} style={[s.td, { flex: c.w }, c.right ? s.right : {}]}>{String(cells[i] ?? "")}</Text>
      ))}
    </View>
  );
}
