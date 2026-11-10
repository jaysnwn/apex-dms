// The kinds of stock entry, usable from the server page and the browser form.
// (Exported from the "use client" form file, the list was only a placeholder
// on the server: ENTRY_TYPES.filter failed and the page did not open.)
export type EntryType = "stock_in" | "stock_out" | "adjustment" | "damage" | "transfer" | "opening";
export const ENTRY_TYPE_KEYS: EntryType[] = ["stock_in", "stock_out", "adjustment", "damage", "transfer", "opening"];
