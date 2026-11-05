// Browser-side preview of the database GST maths (public.calc_line).
// The database recalculates on save, so this is display only.

export type Mode = "inclusive" | "exclusive";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcLine(qty: number, price: number, mode: Mode, discountPct: number, rate: number) {
  const unit = mode === "inclusive" ? price / (1 + rate / 100) : price;
  const gross = r2(qty * unit);
  const discount = r2((gross * (discountPct || 0)) / 100);
  const taxable = r2(gross - discount);
  const tax = r2((taxable * rate) / 100);
  return { gross, discount, taxable, tax, total: r2(taxable + tax) };
}

export function orderTotals(lines: ReturnType<typeof calcLine>[], igst: boolean) {
  const subtotal = r2(lines.reduce((t, l) => t + l.gross, 0));
  const discount = r2(lines.reduce((t, l) => t + l.discount, 0));
  const taxable = r2(lines.reduce((t, l) => t + l.taxable, 0));
  const tax = r2(lines.reduce((t, l) => t + l.tax, 0));
  const exact = r2(taxable + tax);
  const grand = Math.round(exact);
  const half = r2(lines.reduce((t, l) => t + r2(l.tax / 2), 0));
  return {
    subtotal,
    discount,
    taxable,
    tax,
    cgst: igst ? 0 : half,
    sgst: igst ? 0 : r2(tax - half),
    igst: igst ? tax : 0,
    roundOff: r2(grand - exact),
    grand,
  };
}

// Indian number to words, for invoices ("Sixteen Thousand Nine Hundred Fifty Seven Rupees Only").
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function two(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function three(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? two(rest) : ""].filter(Boolean).join(" ");
}

export function amountInWords(amount: number) {
  let n = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - n) * 100);
  if (n === 0 && paise === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  let words = `${parts.join(" ")} Rupees`;
  if (paise) words += ` and ${two(paise)} Paise`;
  return `${words} Only`;
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
