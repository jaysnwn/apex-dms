"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CloudOff, Home, LayoutGrid, Plus, RefreshCw, Route as RouteIcon, Store, Wifi } from "lucide-react";
import { cn } from "@/components/ui";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { duration, ease, spring } from "@/lib/motion";
import { inr } from "@/lib/format";
import { Avatar } from "./ui";
import { onOutboxChange, readOutbox, writeOutbox, type OutboxItem } from "./outbox";
import { submitQuotation } from "./actions";
import { setupServiceWorker } from "@/lib/sw";
import { CompanyLogo } from "@/components/company-logo";

const TABS = [
  { href: "/m", label: "Home", icon: Home },
  { href: "/m/route", label: "Route", icon: RouteIcon },
  { href: "/m/order", label: "Order", icon: Plus, main: true },
  { href: "/m/outlets", label: "Outlets", icon: Store },
  { href: "/m/more", label: "More", icon: LayoutGrid },
];

export function MobileShell({ name, roleLabel, orgName, logoUrl, tenantId, children }: { name: string; roleLabel: string; orgName: string; logoUrl?: string | null; tenantId: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const firstName = name.split(" ")[0] || name;

  const sync = useCallback(async () => {
    const items = readOutbox();
    if (!items.length || !navigator.onLine) return;
    setSyncing(true);
    const left: OutboxItem[] = [];
    let sent = 0;
    for (const it of items) {
      // never send an order into a business other than the one it was taken in
      if (it.tenantId && it.tenantId !== tenantId) { left.push(it); continue; }
      try {
        const res = await submitQuotation({ ...it.data, tenantId: it.tenantId ?? tenantId });
        if (res.error) left.push({ ...it, error: res.error });
        else sent++;
      } catch {
        left.push(it);
      }
    }
    writeOutbox(left);
    setSyncing(false);
    if (sent) router.refresh();
  }, [router, tenantId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setOutbox(readOutbox());
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const stop = onOutboxChange(() => setOutbox(readOutbox()));
    setupServiceWorker();
    sync();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); stop(); };
  }, [sync]);

  const isActive = (href: string) => (href === "/m" ? pathname === "/m" : pathname.startsWith(href));
  const failed = outbox.filter((o) => o.error);

  return (
    <div className="min-h-dvh bg-sunken">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg shadow-[var(--shadow-raised)] sm:border-x sm:border-line">
        {/* Top bar */}
        <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-line/70 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
          {logoUrl ? (
            <>
              {/* The frosted bar isolates blending, so in dark mode the logo sits on a small white chip */}
              <Link href="/m" className="flex min-w-0 flex-1 items-center" aria-label={`${orgName} home`}>
                <CompanyLogo src={logoUrl} name={orgName} className="h-8 w-auto max-w-[60%] rounded-md object-contain mix-blend-multiply dark:bg-white dark:px-1.5 dark:py-0.5 dark:mix-blend-normal" fallbackClassName="truncate text-base font-semibold text-text" />
              </Link>
              <NetPill online={online} />
              <Link href="/m/more" aria-label={`${firstName}, ${roleLabel}: account and more`} title={`${name} · ${roleLabel}`}>
                <Avatar name={name} size={36} />
              </Link>
            </>
          ) : (
            <>
              <Link href="/m/more" className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} size={42} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-base font-semibold text-slate-900">{firstName}</span>
                  <span className="block truncate text-xs text-slate-500">{roleLabel} · {orgName}</span>
                </span>
              </Link>
              <NetPill online={online} />
            </>
          )}
        </header>

        <AnimatePresence initial={false}>
        {outbox.length > 0 && (
          <m.div
            key="outbox"
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
            exit={{ opacity: 0, y: -6, transition: { duration: duration.fast, ease: ease.in } }}
            className={cn("mx-3 mt-3 flex items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm", failed.length ? "bg-red-50 text-red-900" : "bg-blue-50 text-blue-900")}>
            <span>
              {failed.length
                ? <>Order for {failed[0].shop} not sent: {failed[0].error}</>
                : <>{outbox.length} order{outbox.length > 1 ? "s" : ""} ({inr(outbox.reduce((t, o) => t + o.total, 0), { decimals: false })}) saved on phone — {online ? "sending…" : "will send when online"}</>}
            </span>
            {online && (
              <span className="flex shrink-0 gap-1">
                {failed.length > 0 && <button onClick={() => writeOutbox(outbox.filter((o) => o.id !== failed[0].id))} className="rounded-lg bg-surface px-2 py-1 text-xs font-medium text-red-700 shadow-sm">Remove</button>}
                <button onClick={sync} className="grid size-11 place-items-center rounded-xl bg-surface shadow-sm" aria-label="Send now"><RefreshCw className={cn("size-4", syncing && "animate-spin")} /></button>
              </span>
            )}
          </m.div>
        )}
        </AnimatePresence>

        <main className="flex-1 px-3 pt-3 pb-28">
          <m.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: ease.out }}>
            {children}
          </m.div>
        </main>

        {/* Bottom tab bar: frosted, with a pill that slides to the current tab */}
        <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line/70 pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-5">
            {TABS.map((t) => {
              const active = isActive(t.href);
              if (t.main) {
                return (
                  <li key={t.href} className="flex justify-center">
                    <Link href={t.href} className="-mt-6 flex flex-col items-center gap-1" aria-label="New order" aria-current={active ? "page" : undefined}>
                      <m.span
                        whileTap={{ scale: 0.92 }}
                        transition={spring.snappy}
                        className={cn("grid size-16 place-items-center rounded-full bg-gradient-to-b from-blue-500 to-blue-700 text-on-fill shadow-[0_10px_24px_-8px_rgb(21_108_221/0.6)] ring-4 ring-bg", active && "ring-primary-soft")}
                      >
                        <m.span animate={{ rotate: active ? 45 : 0 }} transition={spring.snappy} className="grid">
                          <Plus className="size-8" strokeWidth={2.5} />
                        </m.span>
                      </m.span>
                      <span className={cn("text-xs font-semibold", active ? "text-primary-text" : "text-text-2")}>New order</span>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={t.href}>
                  <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors", active ? "text-primary-text" : "text-text-2")}>
                    <span className="relative grid h-7 w-12 place-items-center">
                      {active && <m.span layoutId="m-tab-pill" className="absolute inset-0 rounded-full bg-primary-soft" transition={spring.snappy} />}
                      <t.icon className="relative size-5" />
                    </span>
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

// Online / offline: the pill swaps with a quick fade so a change of network is noticed.
function NetPill({ online }: { online: boolean }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={online ? "on" : "off"}
        role="status"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1, transition: spring.snappy }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: duration.instant } }}
        className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", online ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900")}
      >
        {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />} {online ? "Online" : "Offline"}
      </m.span>
    </AnimatePresence>
  );
}
