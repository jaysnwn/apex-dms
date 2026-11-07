"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Boxes, LayoutDashboard, LogOut, Menu, Package, PackagePlus, Receipt, Route,
  ScrollText, Settings, ShoppingCart, Store, Truck, Upload, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import type { ModuleDef, ModuleKey } from "@/lib/roles";
import { cn } from "@/components/ui";
import { BrandSwitcher, type SwitcherBrand } from "@/components/brand-switcher";

// Each module keeps one colour everywhere, so people find it at a glance.
// icon = icon colour, tile = soft background behind the icon.
const COLORS: Record<ModuleKey, { icon: string; tile: string }> = {
  dashboard: { icon: "text-sky-300", tile: "bg-sky-400/15" },
  products: { icon: "text-indigo-300", tile: "bg-indigo-400/15" },
  stock: { icon: "text-teal-300", tile: "bg-teal-400/15" },
  purchases: { icon: "text-fuchsia-300", tile: "bg-fuchsia-400/15" },
  retailers: { icon: "text-violet-300", tile: "bg-violet-400/15" },
  sales: { icon: "text-orange-300", tile: "bg-orange-400/15" },
  dispatch: { icon: "text-cyan-300", tile: "bg-cyan-400/15" },
  payments: { icon: "text-emerald-300", tile: "bg-emerald-400/15" },
  routes: { icon: "text-lime-300", tile: "bg-lime-400/15" },
  expenses: { icon: "text-rose-300", tile: "bg-rose-400/15" },
  reports: { icon: "text-amber-300", tile: "bg-amber-400/15" },
  import: { icon: "text-gray-200", tile: "bg-white/10" },
  users: { icon: "text-gray-200", tile: "bg-white/10" },
  audit: { icon: "text-gray-200", tile: "bg-white/10" },
  settings: { icon: "text-gray-200", tile: "bg-white/10" },
};

const ICONS: Record<ModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  stock: Boxes,
  purchases: PackagePlus,
  retailers: Store,
  sales: ShoppingCart,
  dispatch: Truck,
  payments: Wallet,
  routes: Route,
  expenses: Receipt,
  reports: BarChart3,
  import: Upload,
  users: Users,
  audit: ScrollText,
  settings: Settings,
};

type Props = {
  modules: ModuleDef[];
  userName: string;
  roleLabel: string;
  brands: SwitcherBrand[];
  currentBrandId: string | null;
  canSeeAllBrands: boolean;
  children: ReactNode;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// "/sales/new" should stay highlighted on every /sales page; admin items match exactly.
function isActive(href: string, pathname: string) {
  const base = href.startsWith("/admin") ? href : "/" + href.split("/")[1];
  return pathname === base || pathname.startsWith(base + "/");
}

export function Shell({ modules, userName, roleLabel, brands, currentBrandId, canSeeAllBrands, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const main = modules.filter((m) => m.group === "main");
  const admin = modules.filter((m) => m.group === "admin");

  const nav = (
    <nav className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden className="drop-shadow">
          <rect width="32" height="32" rx="9" fill="#f28c18" />
          <path d="M9 23 16 8l7 15h-4l-3-7-3 7z" fill="#1f2937" />
        </svg>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-wide text-white">APEX DMS</div>
          <div className="text-[11px] font-medium tracking-wider text-gray-300/80">APEX TRADING CO.</div>
        </div>
      </div>

      {/* Brand switcher: every inventory screen follows it */}
      {brands.length > 0 && (
        <div className="shrink-0 border-b border-white/10 px-3 py-3">
          <div className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.14em] text-gray-400 uppercase">Brand</div>
          <BrandSwitcher brands={brands} currentId={currentBrandId} canSeeAll={canSeeAllBrands} dark />
        </div>
      )}

      {/* Menu — scrolls only if the screen is very short, without a visible scrollbar */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-3">
        <NavGroup items={main} pathname={pathname} />
        {admin.length > 0 && (
          <>
            <div className="mt-4 mb-1.5 flex items-center gap-2 px-3">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-gray-400 uppercase">Administration</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <NavGroup items={admin} pathname={pathname} />
          </>
        )}
      </div>

      {/* User */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 hover:bg-white/5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-500 text-sm font-bold text-gray-900">
              {initials(userName || "Me")}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{userName || "My account"}</span>
              <span className="block truncate text-[11px] text-gray-300">{roleLabel}</span>
            </span>
          </Link>
          <form action="/auth/signout" method="post">
            <button
              title="Sign out"
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-lg text-gray-300 transition hover:bg-red-500/20 hover:text-red-200"
            >
              <LogOut className="size-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );

  const panel = "bg-gradient-to-b from-gray-700 via-gray-700 to-gray-800";

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 hidden w-64 shadow-xl lg:block", panel)}>{nav}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className={cn("absolute inset-y-0 left-0 w-72 shadow-xl", panel)}>
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-5 right-3 rounded-md p-1 text-gray-300 hover:text-white"
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
          {brands.length > 1 && <div className="ml-auto w-48"><BrandSwitcher brands={brands} currentId={currentBrandId} canSeeAll={false} /></div>}
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
        const c = COLORS[m.key];
        const active = isActive(m.href, pathname);
        return (
          <li key={m.key}>
            <Link
              href={m.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13.5px] transition",
                active
                  ? "bg-white/15 font-semibold text-white shadow-sm ring-1 ring-white/10"
                  : "text-gray-200 hover:bg-white/[0.07] hover:text-white"
              )}
            >
              {active && <span className="absolute inset-y-1.5 -left-3 w-1 rounded-r-full bg-accent-500" />}
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-md transition", c.tile, active && "ring-1 ring-white/20")}>
                <Icon className={cn("size-4", c.icon)} />
              </span>
              <span className="flex-1 truncate">{m.label}</span>
              {!m.ready && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-300">{m.milestone}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
