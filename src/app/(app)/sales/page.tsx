import type { Metadata } from "next";
import { FilePlus2, FileText, ReceiptText, Truck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { inrCompact } from "@/lib/format";
import { SalesBoxes, type Box } from "./sales-boxes";

export const metadata: Metadata = { title: "Sales" };

// The start page of Sales: four boxes, one per Sales page. Inside each page the
// same four show as tabs.
export default async function SalesHome() {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman", "warehouse");
  const supabase = await createClient();
  const today = todayIST();
  const [q, p, t] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "quotation"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "invoiced"),
    supabase.from("invoices").select("grand_total").eq("invoice_date", today).neq("status", "cancelled"),
  ]);
  const quotes = q.count ?? 0;
  const pending = p.count ?? 0;
  const todayCount = t.data?.length ?? 0;
  const todayTotal = (t.data ?? []).reduce((s, r) => s + Number(r.grand_total), 0);
  const salesman = profile.role === "salesman";

  const boxes: Box[] = [
    { href: "/sales/new", label: salesman ? "New order" : "New quotation", icon: FilePlus2, primary: true,
      line: salesman ? "Pick a shop and products, and send it to the office." : "Pick a retailer and products, then save the quotation." },
    { href: "/sales/quotations", label: "Quotations", icon: FileText, count: quotes,
      line: quotes === 0 ? "Nothing waiting." : `${quotes} waiting to be invoiced.` },
    { href: "/sales/pending", label: "Pending for dispatch", icon: Truck, count: pending,
      line: pending === 0 ? "Everything has left the warehouse." : `${pending} invoice${pending === 1 ? "" : "s"} waiting to leave the warehouse.` },
    { href: "/sales/invoices", label: salesman ? "My invoices" : "Invoices", icon: ReceiptText,
      line: todayCount === 0 ? "None made today yet." : `${todayCount} made today · ${inrCompact(todayTotal)}` },
  ];
  const shown = profile.role === "warehouse" ? boxes.slice(2) : boxes;

  return <SalesBoxes boxes={shown} />;
}
