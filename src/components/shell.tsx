"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Boxes, CircleUser, LayoutDashboard, LogOut, Menu, Package, Receipt, Route,
  ScrollText, Settings, ShoppingCart, Store, Truck, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import type { ModuleDef, ModuleKey } from "@/lib/roles";
import { cn } from "@/components/ui";

const ICONS: Record<ModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  stock: Boxes,
  retailers: Store,
  sales: ShoppingCart,
  dispatch: Truck,
  payments: Wallet,
  routes: Route,
  expenses: Receipt,
  reports: BarChart3,
  users: Users,
  audit: ScrollText,
  settings: Settings,
};

type Props = {
  modules: ModuleDef[];
  userName: string;
  roleLabel: string;
  children: ReactNode;
};

export function Shell({ modules, userName, roleLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const main = modules.filter((m) => m.group === "main");
  const admin = modules.filter((m) => m.group === "admin");

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#f28c18" />
          <path d="M9 23 16 8l7 15h-4l-3-7-3 7z" fill="#111a2e" />
        </svg>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide text-white">APEX DMS</div>
          <div className="text-[11px] text-slate-400">APEX TRADING CO.</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <NavGroup items={main} pathname={pathname} />
        {admin.length > 0 && (
          <>
            <div className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              Administration
            </div>
            <NavGroup items={admin} pathname={pathname} />
          </>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <CircleUser className="size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{userName || "My account"}</span>
            <span className="block truncate text-xs text-slate-400">{roleLabel}</span>
          </span>
        </Link>
        <form action="/auth/signout" method="post">
          <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
            <LogOut className="size-5" /> Sign out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-ink-900 lg:block">{nav}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 shadow-xl">
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 rounded-md p-1 text-slate-400 hover:text-white"
            >
              <X className="size-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100">
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold tracking-wide">APEX DMS</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ items, pathname }: { items: ModuleDef[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((m) => {
        const Icon = ICONS[m.key];
        const active = pathname === m.href || pathname.startsWith(m.href + "/");
        return (
          <li key={m.key}>
            <Link
              href={m.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", active && "text-accent-500")} />
              <span className="flex-1">{m.label}</span>
              {!m.ready && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">{m.milestone}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
