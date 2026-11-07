import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, ClipboardList, KeyRound, LogOut, Monitor, Receipt, Route as RouteIcon, Smartphone, Sparkles, Store } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Avatar } from "../ui";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  const { user, profile } = await requireRole("salesman", "manager", "super_admin");
  const items = [
    { href: "/m/incentive", label: "My incentive", icon: Sparkles, tone: "bg-emerald-100 text-emerald-700" },
    { href: "/m/orders", label: "My orders", icon: ClipboardList, tone: "bg-sky-100 text-sky-700" },
    { href: "/m/route", label: "Today's route", icon: RouteIcon, tone: "bg-cyan-100 text-cyan-700" },
    { href: "/m/outlets", label: "My outlets", icon: Store, tone: "bg-violet-100 text-violet-700" },
    { href: "/m/expenses", label: "Expenses", icon: Receipt, tone: "bg-rose-100 text-rose-700" },
    { href: "/account", label: "Change password", icon: KeyRound, tone: "bg-slate-200 text-slate-700" },
  ];
  return (
    <div className="space-y-4">
      <section className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <Avatar name={profile.full_name || "?"} size={64} />
        <div className="min-w-0">
          <div className="truncate text-xl font-bold">{profile.full_name}</div>
          <div className="text-sm text-slate-500">{ROLE_LABELS[profile.role]}</div>
          <div className="truncate text-xs text-slate-400">{user.email}</div>
        </div>
      </section>
      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        {items.map((i) => (
          <li key={i.href} className="border-b border-slate-100 last:border-0">
            <Link href={i.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50">
              <span className={`grid size-10 place-items-center rounded-xl ${i.tone}`}><i.icon className="size-5" /></span>
              <span className="flex-1 font-medium">{i.label}</span>
              <ChevronRight className="size-5 text-slate-300" />
            </Link>
          </li>
        ))}
        {profile.role !== "salesman" && (
          <li><Link href="/dashboard" className="flex items-center gap-3 px-4 py-3.5 active:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-ink-900 text-white"><Monitor className="size-5" /></span><span className="flex-1 font-medium">Back to office app</span><ChevronRight className="size-5 text-slate-300" /></Link></li>
        )}
      </ul>
      <section className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-900">
        <div className="mb-1 flex items-center gap-2 font-semibold"><Smartphone className="size-4" /> Put the app on your home screen</div>
        Android (Chrome): tap ⋮ → <b>Add to Home screen</b>. iPhone (Safari): tap Share → <b>Add to Home Screen</b>. It then opens like a normal app and works with weak network.
      </section>
      <form action="/auth/signout" method="post">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-red-600 ring-1 ring-red-200 active:bg-red-50"><LogOut className="size-5" /> Sign out</button>
      </form>
      <p className="text-center text-xs text-slate-400">APEX DMS · salesman app</p>
    </div>
  );
}
