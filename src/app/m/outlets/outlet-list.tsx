"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Plus, Search, Star } from "lucide-react";
import { cn } from "@/components/ui";
import { inr } from "@/lib/format";
import { RETAILER_CLASS } from "@/lib/status";
import type { Outlet } from "../data";
import { cacheGet, cacheSet } from "../outbox";

const KEY = "dms-m-outlets";

export function OutletList({ initial }: { initial: Outlet[] | null }) {
  const [outlets, setOutlets] = useState<Outlet[]>(initial ?? []);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "today" | "due">("all");
  const [route, setRoute] = useState("all");

  useEffect(() => {
    if (initial) cacheSet(KEY, initial);
    else setOutlets(cacheGet<Outlet[]>(KEY) ?? []);
  }, [initial]);

  const routes = [...new Map(outlets.filter((o) => o.route_id).map((o) => [o.route_id!, o.route_name ?? "Route"])).entries()];
  const t = q.trim().toLowerCase();
  const list = outlets.filter((o) =>
    (f === "all" || (f === "today" && o.onRouteToday) || (f === "due" && o.overdue > 0)) &&
    (route === "all" || o.route_id === route) &&
    (!t || [o.shop_name, o.owner_name, o.city, o.mobile, o.code].some((x) => x?.toLowerCase().includes(t)))
  );
  const due = outlets.filter((o) => o.overdue > 0).length;
  const today = outlets.filter((o) => o.onRouteToday).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <h1 className="text-xl font-bold">My outlets <span className="text-base font-normal text-slate-400">{outlets.length}</span></h1>
        <Link href="/m/outlets/new" className="flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-sm font-semibold text-white shadow-sm active:scale-95"><Plus className="size-4" /> New outlet</Link>
      </div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shop, owner, village, mobile" className="h-12 w-full rounded-2xl border border-slate-200 bg-white pr-4 pl-12 text-base shadow-sm outline-none focus:border-accent-500" />
      </div>
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        <Chip on={f === "all"} onClick={() => setF("all")}>All</Chip>
        <Chip on={f === "today"} onClick={() => setF("today")}>Today&apos;s route · {today}</Chip>
        <Chip on={f === "due"} onClick={() => setF("due")} tone="red">Overdue · {due}</Chip>
        {routes.length > 1 && (
          <select value={route} onChange={(e) => setRoute(e.target.value)} className="h-9 shrink-0 rounded-full border-0 bg-white px-3 text-sm font-medium ring-1 ring-slate-200">
            <option value="all">All routes</option>
            {routes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>
      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        {list.map((o) => {
          const cls = o.classification ? RETAILER_CLASS[o.classification] : null;
          return (
            <li key={o.id} className="border-b border-slate-100 last:border-0">
              <Link href={`/m/outlets/${o.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl text-base font-bold", o.overdue > 0 ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700")}>
                  {o.shop_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{o.shop_name}</span>
                    {o.classification === "star" && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{[o.owner_name, o.city, o.route_name].filter(Boolean).join(" · ")}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {o.onRouteToday && <span className="flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-800"><MapPin className="size-2.5" /> Today</span>}
                    {o.status === "on_hold" && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">On hold</span>}
                    {o.status === "blocked" && <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-800">Blocked</span>}
                    {cls && o.classification !== "star" && o.classification !== "average" && <span className="rounded-full bg-orange-100 px-1.5 text-[10px] font-semibold text-orange-800">{cls.label}</span>}
                  </span>
                </span>
                <span className="text-right">
                  {o.outstanding > 0 ? (
                    <>
                      <span className={cn("tabular block text-sm font-semibold", o.overdue > 0 ? "text-red-700" : "text-slate-800")}>{inr(o.outstanding, { decimals: false })}</span>
                      <span className="block text-[10px] text-slate-400">{o.overdue > 0 ? "has overdue" : "balance"}</span>
                    </>
                  ) : <ChevronRight className="size-5 text-slate-300" />}
                </span>
              </Link>
            </li>
          );
        })}
        {list.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No outlets match.</li>}
      </ul>
    </div>
  );
}

function Chip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: "red" }) {
  return (
    <button onClick={onClick} className={cn("h-9 shrink-0 rounded-full px-4 text-sm font-semibold", on ? (tone === "red" ? "bg-red-600 text-white" : "bg-ink-900 text-white") : "bg-white text-slate-700 ring-1 ring-slate-200")}>
      {children}
    </button>
  );
}
