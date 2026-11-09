import type { Tone } from "@/components/ui";

// One colour language across the app:
//   green = done / paid / healthy      amber = waiting / due soon
//   red   = overdue / blocked / short  blue  = issued / in progress
//   violet = quotation / draft         teal  = dispatched / on the way
//   slate = cancelled / inactive

type S = Record<string, { label: string; tone: Tone }>;

export const ORDER_STATUS: S = {
  quotation: { label: "Quotation", tone: "violet" },
  invoiced: { label: "Pending dispatch", tone: "blue" },
  dispatched: { label: "Dispatched", tone: "teal" },
  delivered: { label: "Delivered", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const PURCHASE_STATUS: S = {
  ordered: { label: "Ordered · not received", tone: "amber" },
  received: { label: "Received", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const SUPPLIER_PAYMENT_STATUS: S = {
  paid: { label: "Paid", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const DUE_STATUS: S = {
  paid: { label: "Paid", tone: "green" },
  not_yet_due: { label: "Not yet due", tone: "blue" },
  due: { label: "Due today", tone: "amber" },
  overdue: { label: "Overdue", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const DISPATCH_STATUS: S = {
  pending: { label: "Waiting", tone: "amber" },
  picking: { label: "Picking", tone: "amber" },
  dispatched: { label: "On the way", tone: "teal" },
  delivered: { label: "Delivered", tone: "green" },
};

export const PAYMENT_STATUS: S = {
  received: { label: "Received", tone: "green" },
  cheque_pending: { label: "Cheque not cleared", tone: "amber" },
  bounced: { label: "Bounced", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const PAYMENT_METHOD: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

export const PROMISE_STATUS: S = {
  open: { label: "Promised", tone: "amber" },
  kept: { label: "Kept", tone: "green" },
  broken: { label: "Broken", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const VISIT_STATUS: S = {
  planned: { label: "To visit", tone: "amber" },
  completed: { label: "Visited", tone: "green" },
  missed: { label: "Missed", tone: "red" },
};

// Expense statuses and categories: see src/lib/expense-labels.ts and the expense_categories table.

export const RETAILER_STATUS: S = {
  active: { label: "Active", tone: "green" },
  on_hold: { label: "On hold", tone: "amber" },
  blocked: { label: "Blocked", tone: "red" },
  inactive: { label: "Inactive", tone: "slate" },
};

export const RETAILER_CLASS: S = {
  star: { label: "★ Star Retailer", tone: "green" },
  average: { label: "Average Retailer", tone: "blue" },
  needs_attention: { label: "Needs Attention", tone: "amber" },
  high_credit_risk: { label: "High Credit Risk", tone: "red" },
};

export function ageingTone(bucket: string | null | undefined): Tone {
  if (!bucket) return "slate";
  if (bucket === "0-15") return "amber";
  return "red";
}
