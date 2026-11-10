import type { SupabaseClient } from "@supabase/supabase-js";

// The words of a search box, as the database search functions expect them
// (search_catalog, search_products, search_retailers, search_retailer_directory,
// search_invoices: every word must appear somewhere in the record's search text).
// Up to 5 words of 60 characters; characters with a meaning in search
// patterns are dropped. One-letter words are left out when there are longer
// ones ("type c" searches "type"): they match nearly everything anyway.
export function searchWords(q: string | null | undefined): string[] {
  const all = (q ?? "").replace(/[,()*%\\_]/g, " ").trim().slice(0, 60).split(/\s+/).filter(Boolean);
  const long = all.filter((w) => w.length >= 2);
  return (long.length ? long : all).slice(0, 5).map((w) => w.toLowerCase());
}

// The rows to list: a search function's results when there are words,
// otherwise the table or view itself. Both are filtered, sorted and cut the
// same way by the caller (.select().eq().order().limit()).
export function searchSource(sb: SupabaseClient, table: string, fn: string, words: string[], args: Record<string, unknown> = {}) {
  return (words.length ? sb.rpc(fn, { p_words: words, ...args }) : sb.from(table)) as unknown as ReturnType<SupabaseClient["from"]>;
}
