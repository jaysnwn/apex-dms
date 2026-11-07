import type { Metadata } from "next";
import { requireRole, type Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CreateUserForm, EditUserForm } from "./user-forms";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const { profile: me } = await requireRole("super_admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("full_name");
  const users = (data ?? []) as Profile[];
  const [{ data: brands }, { data: access }] = await Promise.all([
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profile_brands").select("user_id, brand_id"),
  ]);
  const brandList = brands ?? [];
  const accessOf = (id: string) => (access ?? []).filter((a) => a.user_id === id).map((a) => a.brand_id as string);
  const brandName = new Map(brandList.map((b) => [b.id as string, b.name as string]));

  const counts = ROLES.map((r) => ({ role: r, n: users.filter((u) => u.role === r && u.is_active).length }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Every person gets their own login. Their role decides what they can see and change."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {counts.map((c) => (
          <Badge key={c.role}>
            {ROLE_LABELS[c.role]}: <span className="tabular ml-1 font-semibold">{c.n}</span>
          </Badge>
        ))}
      </div>

      <Card className="mb-8 p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Add a user</h2>
        <CreateUserForm brands={brandList} />
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">All users ({users.length})</h2>
      <div className="space-y-3">
        {users.map((u) => (
          <details key={u.id} className="group rounded-xl border border-slate-200 bg-white open:shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {(u.full_name || u.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">
                  {u.full_name || "(no name)"} {u.id === me.id && <span className="text-slate-400">· you</span>}
                </div>
                <div className="truncate text-sm text-slate-500">{u.email}</div>
              </div>
              <div className="hidden gap-1 sm:flex">
                <Badge tone="blue">{ROLE_LABELS[u.role]}</Badge>
                <Badge>{u.role === "super_admin" ? "All brands" : accessOf(u.id).map((b) => brandName.get(b)).filter(Boolean).join(" + ") || "No brand"}</Badge>
              </div>
              {u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
            </summary>
            <div className="border-t border-slate-100 p-4">
              <EditUserForm user={u} isSelf={u.id === me.id} brands={brandList} brandIds={accessOf(u.id)} />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
