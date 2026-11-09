// Labels and types shared by the office expense pages and the salesman app.
// Categories are NOT listed here: they live in the expense_categories table.
import type { Tone } from "@/components/ui";

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "returned" | "cancelled";
export type ReimbursementStatus = "not_applicable" | "pending" | "partial" | "reimbursed" | null;

export const EXPENSE_STATUS: Record<ExpenseStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  submitted: { label: "Waiting approval", tone: "amber" },
  approved: { label: "Approved", tone: "blue" },
  rejected: { label: "Rejected", tone: "red" },
  returned: { label: "Returned", tone: "orange" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const REIMBURSEMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  not_applicable: { label: "Company paid", tone: "slate" },
  pending: { label: "To be paid", tone: "amber" },
  partial: { label: "Partly paid", tone: "violet" },
  reimbursed: { label: "Reimbursed", tone: "green" },
};

export const EXPENSE_PAYMENT_METHOD: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  company_card: "Company card",
  other: "Other",
};

export const REIMBURSE_METHOD: Record<string, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  submitted: "Submitted",
  auto_approved: "Approved automatically",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for correction",
  cancelled: "Cancelled",
  withdrawn: "Withdrawn",
  deleted: "Deleted",
  reimbursed: "Paid",
  reimbursement_cancelled: "Payment reversed",
  migrated: "Carried over",
};

export type ExpenseCategory = {
  id: string;
  code: string | null;
  name: string;
  receipt_required: boolean;
  route_required: boolean;
  approval_required: boolean;
  auto_approve_limit: number;
  is_active: boolean;
  sort_order: number;
};

// A row of the expense_list view.
export type ExpenseRow = {
  id: string;
  expense_no: string | null;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  created_by: string;
  created_by_name: string | null;
  source: "office" | "salesman_app";
  category_id: string;
  category_name: string;
  amount: number;
  expense_date: string;
  route_id: string | null;
  route_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_code: string | null;
  description: string | null;
  payment_method: string | null;
  paid_by: "employee" | "company";
  receipt_path: string | null;
  notes: string | null;
  status: ExpenseStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  approved_amount: number | null;
  reimbursed_amount: number;
  outstanding: number;
  reimbursement_status: ReimbursementStatus;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  possible_duplicate: boolean;
};

export type ExpenseSummary = {
  incurred: number;
  submitted: number;
  pending: number;
  pending_count: number;
  approved: number;
  approved_count: number;
  rejected: number;
  rejected_count: number;
  returned: number;
  outstanding: number;
  reimbursed: number;
  company_paid: number;
  employee_paid: number;
  drafts: number;
};

export const EMPTY_SUMMARY: ExpenseSummary = {
  incurred: 0, submitted: 0, pending: 0, pending_count: 0, approved: 0, approved_count: 0, rejected: 0, rejected_count: 0,
  returned: 0, outstanding: 0, reimbursed: 0, company_paid: 0, employee_paid: 0, drafts: 0,
};

export type ExpenseEvent = { id: number; action: string; old_status: string | null; new_status: string | null; amount: number | null; performed_by: string | null; performer: string | null; remarks: string | null; created_at: string };
export type ReimbursementRef = { id: string; reimbursement_no: string | null; paid_on: string; method: string; reference_no: string | null; amount: number; line_amount: number; cancelled_at: string | null; notes: string | null; proof_url: string | null };

export type ExpenseDetail = {
  expense: ExpenseRow;
  receiptUrl: string | null;
  events: ExpenseEvent[];
  payments: ReimbursementRef[];
};

// What the signed-in user may do with an expense (the database enforces the same rules).
export function expensePermissions(e: Pick<ExpenseRow, "status" | "employee_id" | "created_by" | "reimbursed_amount">, me: { id: string; role: string }) {
  const mgr = me.role === "super_admin" || me.role === "manager";
  const mineOrCreated = e.employee_id === me.id || e.created_by === me.id;
  return {
    edit: ((e.status === "draft" || e.status === "returned") && (mineOrCreated || mgr)) || (e.status === "submitted" && mgr),
    submit: (e.status === "draft" || e.status === "returned") && (mineOrCreated || mgr),
    remove: (e.status === "draft" || e.status === "returned") && (mineOrCreated || mgr),
    review: e.status === "submitted" && mgr && (e.employee_id !== me.id || me.role === "super_admin"),
    cancel: mgr && ["submitted", "approved", "returned"].includes(e.status) && Number(e.reimbursed_amount) === 0,
  };
}
