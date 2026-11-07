// Formatting helpers (Indian locale).

export function inr(value: number | string | null | undefined, opts: { decimals?: boolean } = {}) {
  const n = Number(value ?? 0);
  const decimals = opts.decimals ?? true;
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })
  );
}

export function qty(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const GST_RATES = [0, 3, 5, 12, 18, 28, 40];

export const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening stock",
  stock_in: "Stock in",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  adjustment: "Adjustment",
  damage: "Damaged",
  reconciliation: "Stock count",
  dispatch: "Dispatch",
  dispatch_reversal: "Dispatch reversed",
  credit_note_return: "Returned (credit note)",
  stock_out: "Stock outward",
  purchase_return: "Purchase return",
};

// What a stock movement means in business terms (purchase, sale, return ...).
export const TXN_TYPES: Record<string, { label: string; types: string[] }> = {
  purchase: { label: "Purchase", types: ["stock_in"] },
  sale: { label: "Sale", types: ["dispatch", "dispatch_reversal"] },
  sales_return: { label: "Sales return", types: ["credit_note_return"] },
  purchase_return: { label: "Purchase return", types: ["purchase_return"] },
  adjustment: { label: "Stock adjustment", types: ["adjustment", "reconciliation", "damage"] },
  transfer: { label: "Stock transfer", types: ["transfer_in", "transfer_out"] },
  manual: { label: "Inward / outward", types: ["stock_in", "stock_out", "opening"] },
};
export function txnLabel(type: string, refType?: string | null) {
  switch (type) {
    case "stock_in": return refType === "purchase" ? "Purchase" : "Stock inward";
    case "dispatch": return "Sale";
    case "dispatch_reversal": return "Sale cancelled";
    case "credit_note_return": return "Sales return";
    case "purchase_return": return "Purchase return";
    case "adjustment": return refType === "purchase" ? "Purchase cancelled" : "Stock adjustment";
    case "reconciliation": return "Stock verification";
    case "damage": return "Damaged";
    case "transfer_in": return "Transfer in";
    case "transfer_out": return "Transfer out";
    case "stock_out": return "Stock outward";
    case "opening": return "Opening stock";
    default: return MOVEMENT_LABELS[type] ?? type;
  }
}

export const RETAILER_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  blocked: "Blocked",
  inactive: "Inactive",
};

export const RETAILER_CLASS_LABELS: Record<string, string> = {
  star: "Star Retailer",
  average: "Average Retailer",
  needs_attention: "Needs Attention",
  high_credit_risk: "High Credit Risk",
};

// Strip characters that would break a PostgREST or() filter.
export function safeSearch(q: string | undefined) {
  return (q ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 60);
}

// Normalise an Indian mobile: drop spaces, dashes, +91 / leading 0.
export function normaliseMobile(v: string) {
  let m = v.replace(/[^0-9]/g, "");
  if (m.length === 12 && m.startsWith("91")) m = m.slice(2);
  if (m.length === 11 && m.startsWith("0")) m = m.slice(1);
  return m;
}
