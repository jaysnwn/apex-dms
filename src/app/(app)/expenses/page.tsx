import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCheck, ListChecks, ReceiptText, ReceiptIndianRupee, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { inrCompact } from "@/lib/format";
import { expenseSummary, monthRange } from "@/lib/expenses";
import { SectionBoxes, type Box } from "@/components/section-boxes";
import { ALL_TIME_FROM, expenseAccess } from "./access";

export const metadata: Metadata = { title: "Expenses" };

// Old links used /expenses?tab=…; each tab is its own page now.
const OLD_TABS: Record<string, string> = { mine: "/expenses/mine", approve: "/expenses/approve", reimburse: "/expenses/reimburse", all: "/expenses/all" };

// The start page of Expenses: one box per Expenses page. Inside each page the same
// boxes show as tabs.
export default async function ExpensesHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, profile } = await requireRole();
  const sp = await searchParams;
  if (sp.tab && OLD_TABS[sp.tab]) {
    const { tab, ...rest } = sp;
    const n = new URLSearchParams(Object.entries(rest).filter(([, v]) => v) as [string, string][]);
    redirect(`${OLD_TABS[tab]}${n.size ? `?${n}` : ""}`);
  }

  const { mgr, office } = expenseAccess(profile.role);
  const supabase = await createClient();
  const today = todayIST();
  const month = monthRange(today.slice(0, 7));
  const [mine, everyone, allTime] = await Promise.all([
    expenseSummary(supabase, { ...month, employee: user.id }),
    office ? expenseSummary(supabase, month) : Promise.resolve(null),
    office ? expenseSummary(supabase, { from: ALL_TIME_FROM, to: today }) : Promise.resolve(null),
  ]);

  const boxes: Box[] = [
    { href: "/expenses/new", label: "Add expense", icon: ReceiptIndianRupee, primary: true,
      line: office ? "For yourself, a salesman or another employee." : "Log what you spent; it goes to your manager for approval." },
  ];
  if (mgr && allTime) boxes.push({ href: "/expenses/approve", label: "To approve", icon: CheckCheck, count: allTime.pending_count,
    line: allTime.pending_count === 0 ? "Nothing waiting." : `${allTime.pending_count} waiting · ${inrCompact(allTime.pending)}` });
  if (office && allTime) boxes.push({ href: "/expenses/reimburse", label: "To reimburse", icon: Wallet,
    line: allTime.outstanding > 0 ? `${inrCompact(allTime.outstanding)} still to pay back to employees.` : "Everyone has been paid back." });
  if (office && everyone) boxes.push({ href: "/expenses/all", label: "All expenses", icon: ListChecks,
    line: everyone.incurred > 0 ? `${inrCompact(everyone.incurred)} spent this month.` : "Nothing spent this month yet." });
  // Managers reach their own list from the tabs; four boxes keep the page tidy.
  if (!mgr) boxes.push({ href: "/expenses/mine", label: "My expenses", icon: ReceiptText, count: mine.pending_count,
    line: mine.incurred > 0 ? `${inrCompact(mine.incurred)} this month${mine.pending_count ? ` · ${mine.pending_count} waiting approval` : ""}.` : "Nothing logged this month yet." });

  return <SectionBoxes boxes={boxes} />;
}
