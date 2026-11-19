"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowLeftRight, ChevronRight, Command as CommandIcon, Keyboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Search, Sun, X,
} from "lucide-react";
import type { AppRole, ModuleDef } from "@/lib/roles";
import { Kbd, cn } from "@/components/ui";
import { PLATFORM_NAME } from "@/lib/tenant-shared";
import { SignOutButton } from "@/components/sign-out-button";
import { CompanyLogo } from "@/components/company-logo";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsSheet } from "@/components/shortcuts-sheet";
import { GO_KEYS, QUICK_ACTIONS, navFor, tabsFor, type NavGroup, type NavItem } from "@/components/nav-config";
import { rememberPage, togglePin, useNavStore } from "@/lib/recent";
import { usePrefs } from "@/components/prefs-provider";
import { duration, ease, spring } from "@/lib/motion";

type Props = {
  modules: ModuleDef[];
  role: AppRole;
  userName: string;
  roleLabel: string;
  orgName: string;
  logoUrl?: string | null;
  canSwitchOrg: boolean;
  children: ReactNode;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || Boolean(t.closest("[role=dialog]"));
}

const COLLAPSE_KEY = "dms_nav_collapsed";
const pageTitle = () => document.title.replace(/\s·\s[^·]+$/, "").trim();

export function Shell({ modules, role, userName, roleLabel, orgName, logoUrl, canSwitchOrg, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = usePrefs();
  const groups = useMemo(() => navFor(modules), [modules]);
  const tabs = useMemo(() => tabsFor(role, groups), [role, groups]);
  const allowed = useMemo(() => new Set(modules.map((x) => x.key)), [modules]);
  const actions = useMemo(() => {
    const list = QUICK_ACTIONS.filter((a) => allowed.has(a.module) && !(role === "warehouse" && a.module === "sales"));
    return canSwitchOrg ? [...list, { key: "switch-org", label: "Switch business", href: "/select-org", module: "dashboard" as const, keywords: "company organisation tenant odoo copy" }] : list;
  }, [allowed, role, canSwitchOrg]);
  const { recent, pinned } = useNavStore();

  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  // Close the phone menu on navigation; remember detail pages as "recent".
  useEffect(() => {
    setDrawer(false);
    const t = setTimeout(() => {
      const tt = pageTitle();
      setTitle(tt);
      const isDetail = pathname.split("/").some((s) => /^[0-9a-f-]{20,}$/i.test(s));
      if (isDetail && tt) rememberPage({ href: pathname, title: tt });
    }, 350);
    return () => clearTimeout(t);
  }, [pathname]);

  const current = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find((i) => i.match(pathname));
  const isPinned = pinned.some((p) => p.href === pathname);

  // Keyboard: Ctrl/⌘ K palette, ? shortcut sheet, / search, single-letter actions, G then a letter.
  const goPending = useRef<number | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || palette || help) return;
      const k = e.key.toLowerCase();
      if (goPending.current) {
        window.clearTimeout(goPending.current);
        goPending.current = null;
        const target = GO_KEYS.find((g) => g.key === k);
        const item = target && groups.flatMap((g) => g.items).find((i) => i.key === target.nav);
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (k === "/" && !pathname.startsWith("/sales/new") && !pathname.startsWith("/sales/orders")) {
        e.preventDefault();
        setPalette(true);
      } else if (k === "g") {
        goPending.current = window.setTimeout(() => (goPending.current = null), 1200);
      } else {
        const a = actions.find((x) => x.shortcut?.toLowerCase() === k);
        if (a) {
          e.preventDefault();
          router.push(a.href);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, groups, help, palette, pathname, router]);

  // The business's own logo (Admin → Company) when there is one: multiply drops a white
  // background in light mode; in dark mode the logo is inverted and screened, so a navy
  // wordmark reads light on the dark menu without a white box around it.
  const mark = (
    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-700 text-on-fill shadow-[var(--shadow-card)]">
      <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden><path d="M8 25 16 7l8 18h-4.5L16 17l-3.5 8z" fill="currentColor" /></svg>
    </span>
  );
  const brand = (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3" title={orgName}>
      {logoUrl && !collapsed ? (
        <span className="flex min-w-0 flex-col">
          <CompanyLogo
            src={logoUrl}
            name={orgName}
            className="-ml-1 h-12 w-auto max-w-[196px] object-contain object-left brightness-[1.04] contrast-[1.04] mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180"
            fallbackClassName="truncate text-[14px] font-semibold text-text"
          />
          <span className="-mt-1 pl-0.5 text-[11px] font-medium tracking-[0.18em] text-text-3 uppercase">{PLATFORM_NAME}</span>
        </span>
      ) : (
        <>
          {mark}
          <span className={cn("min-w-0 leading-tight", collapsed && "lg:hidden")}>
            <span className="block truncate text-[14px] font-semibold text-text">{orgName}</span>
            <span className="block text-[11.5px] text-text-2">{PLATFORM_NAME}</span>
          </span>
        </>
      )}
    </Link>
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="min-h-dvh">
        <a href="#main" className="sr-only z-[70] rounded-md bg-primary px-3 py-2 text-on-fill focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <m.aside
          className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface [contain:layout_paint] lg:flex"
          // The one width animation in the app: a fixed panel, isolated with CSS containment,
          // so only the menu itself is laid out again. The page beside it moves once, not per frame.
          initial={false}
          animate={{ width: collapsed ? 76 : 256 }}
          transition={spring.gentle}
          aria-label="Main menu"
        >
          <div className={cn("flex h-[72px] shrink-0 items-center gap-2 px-4", collapsed && "justify-center px-0")}>{brand}</div>
          <SideNav groups={groups} pathname={pathname} collapsed={collapsed} pinned={pinned} recent={recent} />
          <div className={cn("shrink-0 border-t border-line p-3", collapsed && "px-2")}>
            <UserBox name={userName} roleLabel={roleLabel} collapsed={collapsed} canSwitchOrg={canSwitchOrg} orgName={orgName} />
            <NavButton label={collapsed ? "Expand menu" : "Collapse menu"} collapsed={collapsed} onClick={toggleCollapsed}>
              {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            </NavButton>
          </div>
        </m.aside>

        {/* Phone/tablet menu (sheet from the left) */}
        <AnimatePresence>
          {drawer && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <m.button
                aria-label="Close menu"
                className="absolute inset-0 bg-black/40"
                onClick={() => setDrawer(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: duration.fast } }}
                exit={{ opacity: 0, transition: { duration: duration.instant } }}
              />
              <m.aside
                className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col bg-surface shadow-[var(--shadow-raised)]"
                initial={{ x: "-100%" }}
                animate={{ x: 0, transition: spring.gentle }}
                exit={{ x: "-100%", transition: { duration: duration.fast, ease: ease.in } }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0.5, right: 0 }}
                onDragEnd={(_, info) => (info.offset.x < -80 || info.velocity.x < -500) && setDrawer(false)}
              >
                <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
                  {brand}
                  <button aria-label="Close menu" onClick={() => setDrawer(false)} className="grid size-11 place-items-center rounded-full text-text-2 hover:bg-sunken">
                    <X className="size-5" />
                  </button>
                </div>
                <SideNav groups={groups} pathname={pathname} collapsed={false} pinned={pinned} recent={recent} />
                <div className="shrink-0 border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                  <UserBox name={userName} roleLabel={roleLabel} collapsed={false} canSwitchOrg={canSwitchOrg} orgName={orgName} />
                </div>
              </m.aside>
            </div>
          )}
        </AnimatePresence>

        <div className={cn(collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
          {/* Top bar: where you are, search, theme, shortcuts */}
          <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line/70 px-3 sm:px-4 lg:h-16 lg:px-8">
            <button aria-label="Open menu" onClick={() => setDrawer(true)} className="grid size-11 place-items-center rounded-full text-text hover:bg-sunken lg:hidden">
              <Menu className="size-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
              {current?.group && current.group !== current.label && (
                <>
                  <span className="hidden truncate text-text-2 sm:inline">{current.group}</span>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-text-3 sm:inline" aria-hidden />
                </>
              )}
              {current && (
                <Link href={current.href} className="truncate font-medium text-text hover:underline">
                  {current.label}
                </Link>
              )}
              {current && title && title !== current.label && pathname !== current.href && (
                <>
                  <ChevronRight className="size-3.5 shrink-0 text-text-3" aria-hidden />
                  <span className="truncate text-text-2" aria-current="page">{title}</span>
                </>
              )}
            </nav>

            <button
              onClick={() => setPalette(true)}
              className="ml-auto flex h-10 items-center gap-2.5 rounded-full border border-line bg-surface px-3 text-sm text-text-2 transition-colors hover:border-field/60 hover:text-text sm:w-72 lg:w-80"
              aria-label="Search and go (Ctrl K)"
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="hidden truncate sm:inline">Search or jump to…</span>
              <span className="ml-auto hidden items-center gap-1 sm:flex"><Kbd><CommandIcon className="size-3" aria-hidden />K</Kbd></span>
            </button>
            {title && (
              <IconButton label={isPinned ? "Unpin this page" : "Pin this page to the menu"} onClick={() => togglePin({ href: pathname, title })} className="hidden sm:grid">
                {isPinned ? <PinOff className="size-[18px]" /> : <Pin className="size-[18px]" />}
              </IconButton>
            )}
            <IconButton label="Keyboard shortcuts (?)" onClick={() => setHelp(true)} className="hidden lg:grid">
              <Keyboard className="size-[18px]" />
            </IconButton>
            <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={theme === "dark" ? "moon" : "sun"}
                  initial={{ opacity: 0, rotate: -60, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1, transition: spring.snappy }}
                  exit={{ opacity: 0, rotate: 60, scale: 0.7, transition: { duration: duration.instant } }}
                  className="grid"
                >
                  {theme === "dark" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
                </m.span>
              </AnimatePresence>
            </IconButton>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
            {children}
          </main>
        </div>

        {/* Phone bottom bar for the 4 most-used places + More */}
        <nav
          aria-label="Quick menu"
          className="glass fixed inset-x-0 bottom-0 z-30 flex border-t border-line/70 pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {tabs.map((t) => {
            const active = t.match(pathname);
            const Icon = t.icon;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors", active ? "text-primary-text" : "text-text-2")}
              >
                {active && <m.span layoutId="tabbar-pill" className="absolute top-1.5 h-8 w-14 rounded-full bg-primary-soft" transition={spring.snappy} />}
                <Icon className="relative size-[22px]" aria-hidden />
                <span className="relative">{t.short ?? t.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-text-2">
            <Menu className="size-[22px]" aria-hidden />
            More
          </button>
        </nav>

        <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} actions={actions} recent={recent} />
        {help && <ShortcutsSheet onClose={() => setHelp(false)} actions={actions} groups={groups} />}
      </div>
    </Tooltip.Provider>
  );
}

function SideNav({ groups, pathname, collapsed, pinned, recent }: { groups: NavGroup[]; pathname: string; collapsed: boolean; pinned: { href: string; title: string }[]; recent: { href: string; title: string }[] }) {
  return (
    <div className={cn("no-scrollbar flex-1 overflow-y-auto px-3 pb-4", collapsed && "px-2")}>
      {groups.map((g, gi) => (
        <div key={g.label ?? "home"} className={cn(gi > 0 && "mt-4")}>
          {g.label && !collapsed && <div className="px-3 pb-1.5 text-xs font-medium text-text-2">{g.label}</div>}
          {g.label && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.key}>
                <SideLink item={item} active={item.match(pathname)} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!collapsed && pinned.length > 0 && <MiniList label="Pinned" items={pinned} pathname={pathname} />}
      {!collapsed && recent.length > 0 && <MiniList label="Recent" items={recent.slice(0, 4)} pathname={pathname} />}
    </div>
  );
}

function SideLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-full px-3 text-[14px] transition-colors duration-[160ms]",
        collapsed && "justify-center px-0",
        active ? "font-semibold text-primary-text" : "text-text-2 hover:bg-sunken hover:text-text"
      )}
    >
      {active && <m.span layoutId="sidenav-active" className="absolute inset-0 rounded-full bg-primary-soft" transition={spring.snappy} aria-hidden />}
      <Icon className="relative size-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.9} aria-hidden />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className="z-[70] rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-on-fill shadow-[var(--shadow-raised)]">
          {item.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function MiniList({ label, items, pathname }: { label: string; items: { href: string; title: string }[]; pathname: string }) {
  return (
    <div className="mt-5">
      <div className="px-3 pb-1 text-xs font-medium text-text-2">{label}</div>
      <ul>
        {items.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              aria-current={p.href === pathname ? "page" : undefined}
              className={cn("block truncate rounded-full px-3 py-1.5 text-[13px] text-text-2 hover:bg-sunken hover:text-text", p.href === pathname && "text-text")}
            >
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserBox({ name, roleLabel, collapsed, canSwitchOrg, orgName }: { name: string; roleLabel: string; collapsed: boolean; canSwitchOrg: boolean; orgName: string }) {
  return (
    <>
    {canSwitchOrg && (
      <Link
        href="/select-org"
        title={`Switch business (now: ${orgName})`}
        aria-label={`Switch business. Now in ${orgName}`}
        className={cn("mb-2 flex h-10 items-center gap-2.5 rounded-full border border-line px-3 text-[13px] text-text-2 transition-colors hover:bg-sunken hover:text-text", collapsed && "justify-center px-0")}
      >
        <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-text">{orgName}</span>
          </span>
        )}
        {!collapsed && <span className="shrink-0 font-medium text-primary-text">Switch</span>}
      </Link>
    )}
    <div className={cn("mb-1 flex items-center gap-2", collapsed && "flex-col")}>
      <Link href="/account" className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-full p-1 pr-2 hover:bg-sunken", collapsed && "flex-none p-0.5 pr-0.5")} title="My account">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary-text">{initials(name || "Me")}</span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-text">{name || "My account"}</span>
            <span className="block truncate text-xs text-text-2">
              {roleLabel}
            </span>
          </span>
        )}
      </Link>
      <SignOutButton className="grid size-9 shrink-0 place-items-center rounded-full text-text-2 transition-colors hover:bg-red-50 hover:text-red-700">
        <LogOut className="size-[18px]" aria-label="Sign out" />
      </SignOutButton>
    </div>
    </>
  );
}

function NavButton({ label, collapsed, onClick, children }: { label: string; collapsed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("flex h-9 w-full items-center gap-3 rounded-full px-3 text-[13px] text-text-2 transition-colors hover:bg-sunken hover:text-text", collapsed && "justify-center px-0")}
    >
      {children}
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn("grid size-10 shrink-0 place-items-center rounded-full text-text-2 transition-colors hover:bg-sunken hover:text-text", className)}>
      {children}
    </button>
  );
}
