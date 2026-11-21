import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { allRows } from "@/lib/all-rows";
import type { EntryRow, ShopRow, StatementScope } from "@/lib/account-statement";

type Sb = SupabaseClient<Database>;

export type StatementSubject = { scope: StatementScope; id: string; name: string; detail: string | null };

// The name of what the statement is for, read with the caller's permissions:
// null when it does not exist or the login may not see it.
export async function statementSubject(sb: Sb, scope: StatementScope, id: string): Promise<StatementSubject | null> {
  if (scope === "retailer") {
    const { data } = await sb.from("retailers").select("shop_name, code").eq("id", id).maybeSingle();
    return data ? { scope, id, name: data.shop_name, detail: data.code } : null;
  }
  if (scope === "town") {
    const { data } = await sb.from("locations").select("name, territories(name)").eq("id", id).maybeSingle();
    const t = data?.territories as unknown as { name: string } | null;
    return data ? { scope, id, name: data.name, detail: t?.name ?? null } : null;
  }
  if (scope === "route") {
    const { data } = await sb.from("routes").select("name, code, territories(name)").eq("id", id).maybeSingle();
    const t = data?.territories as unknown as { name: string } | null;
    return data ? { scope, id, name: data.name, detail: [data.code, t?.name].filter(Boolean).join(" · ") || null } : null;
  }
  const { data } = await sb.from("territories").select("name, code").eq("id", id).maybeSingle();
  return data ? { scope, id, name: data.name, detail: data.code } : null;
}

// One row per shop, in print order. Paged: a territory can pass 1,000 shops.
export async function statementShops(sb: Sb, scope: StatementScope, id: string, from: string | null, to: string): Promise<ShopRow[]> {
  const args = { p_scope: scope, p_id: id, p_from: from, p_to: to };
  const { data } = await allRows(() => sb.rpc("account_statement", args).order("shop_position"));
  return data as ShopRow[];
}

// Every ledger line of the period with its running balance, in print order.
export async function statementEntries(sb: Sb, scope: StatementScope, id: string, from: string | null, to: string): Promise<EntryRow[]> {
  const args = { p_scope: scope, p_id: id, p_from: from, p_to: to };
  const { data } = await allRows(() => sb.rpc("account_statement_entries", args).order("line_no"));
  return data as EntryRow[];
}
