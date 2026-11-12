// A value the database guarantees, where its type cannot say so.
//
// Postgres does not record whether a view column can be null, so the generated
// types report every one of them as nullable (see lib/supabase/database.ts).
// Some of them cannot be null: invoice_balances.invoice_id is invoices.id,
// a NOT NULL column of the view's FROM table, and the view adds only LEFT
// JOINs to aggregates.
//
// Use this where the column is of that kind. It is NOT a way to silence the
// checker: substituting an empty string or a zero would let a value that
// should never be missing travel on as "" or 0 and end up in a total or on a
// printed invoice. If the impossible happens -- a view is rewritten, a join
// changes -- this stops the request with a message naming the field instead.
export function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${field} came back empty from the database, which should not be possible. The report was stopped rather than shown with a gap in it.`);
  }
  return value;
}
