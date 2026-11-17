"use client";

import * as RD from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { ArrowRight, Clock, FileText, Loader2, Package, Search, Store, Zap } from "lucide-react";
import { searchEverything, type SearchHit } from "@/app/(app)/search-actions";
import { Kbd, cn } from "./ui";
import type { NavGroup, QuickAction } from "./nav-config";
import type { PageRef } from "@/lib/recent";
import { duration, ease, staggerDelay } from "@/lib/motion";

const KIND_ICON = { invoice: FileText, retailer: Store, product: Package } as const;
const KIND_LABEL = { invoice: "Invoices", retailer: "Retailers", product: "Products" } as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  actions: QuickAction[];
  recent: PageRef[];
};

// Ctrl/⌘ K: jump to any page, find an invoice, retailer or product by number, name or
// phone, or start a common task.
export function CommandPalette({ open, onOpenChange, groups, actions, recent }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
    }
  }, [open]);

  // Search as you type, after a short pause; ignore answers that arrive out of order.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        try {
          const res = await searchEverything(text);
          if (n === seq.current) setHits(res);
        } catch {
          if (n === seq.current) setHits([]);
        }
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const pages = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label ?? "Home" })));
  const byKind = (["invoice", "retailer", "product"] as const).map((k) => ({ kind: k, rows: hits.filter((h) => h.kind === k) })).filter((g) => g.rows.length);
  let i = 0;
  const delay = () => staggerDelay(i++);

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: duration.fast } }}
                exit={{ opacity: 0, transition: { duration: duration.instant } }}
              />
            </RD.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh]">
              <RD.Content asChild forceMount aria-describedby={undefined}>
                <m.div
                  className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-[var(--radius-sheet)] border border-line bg-raised shadow-[var(--shadow-raised)]"
                  initial={{ opacity: 0, scale: 0.97, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: ease.in } }}
                >
                  <RD.Title className="sr-only">Search and go</RD.Title>
                  <Command label="Search and go" shouldFilter={true} loop>
                    <div className="flex items-center gap-3 border-b border-line px-4">
                      <Search className="size-[18px] shrink-0 text-text-2" aria-hidden />
                      <Command.Input
                        value={q}
                        onValueChange={setQ}
                        placeholder="Search invoices, retailers, products, phone… or type a page"
                        className="h-14 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-3 focus-visible:outline-none"
                      />
                      {pending ? <Loader2 className="size-4 animate-spin text-text-2" aria-label="Searching" /> : <Kbd>Esc</Kbd>}
                    </div>
                    <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-2">
                      <Command.Empty className="px-3 py-10 text-center text-sm text-text-2">
                        {q.trim().length >= 2 && pending ? "Searching…" : "Nothing found. Try a shop name, invoice number or phone."}
                      </Command.Empty>

                      {byKind.map((g) => (
                        <Command.Group key={g.kind} heading={KIND_LABEL[g.kind]}>
                          {g.rows.map((h) => {
                            const Icon = KIND_ICON[h.kind];
                            return (
                              <Row key={h.kind + h.id} value={`${h.kind} ${h.title} ${h.subtitle} ${q}`} onSelect={() => go(h.href)} delay={delay()}>
                                <Icon className="size-4 shrink-0 text-text-2" aria-hidden />
                                <span className={cn("truncate font-medium text-text", h.kind === "invoice" && "font-mono text-[13px]")}>{h.title}</span>
                                <span className="truncate text-text-2">{h.subtitle}</span>
                              </Row>
                            );
                          })}
                        </Command.Group>
                      ))}

                      {actions.length > 0 && (
                        <Command.Group heading="Actions">
                          {actions.map((a) => (
                            <Row key={a.key} value={`${a.label} ${a.keywords ?? ""}`} onSelect={() => go(a.href)} delay={delay()}>
                              <Zap className="size-4 shrink-0 text-primary" aria-hidden />
                              <span className="font-medium text-text">{a.label}</span>
                              {a.shortcut && <Kbd className="ml-auto">{a.shortcut}</Kbd>}
                            </Row>
                          ))}
                        </Command.Group>
                      )}

                      {recent.length > 0 && q.trim().length === 0 && (
                        <Command.Group heading="Recent">
                          {recent.map((r) => (
                            <Row key={r.href} value={`recent ${r.title} ${r.href}`} onSelect={() => go(r.href)} delay={delay()}>
                              <Clock className="size-4 shrink-0 text-text-2" aria-hidden />
                              <span className="truncate text-text">{r.title}</span>
                            </Row>
                          ))}
                        </Command.Group>
                      )}

                      <Command.Group heading="Go to">
                        {pages.map((p) => {
                          const Icon = p.icon;
                          return (
                            <Row key={p.key} value={`${p.label} ${p.group}`} onSelect={() => go(p.href)} delay={delay()}>
                              <Icon className="size-4 shrink-0 text-text-2" aria-hidden />
                              <span className="text-text">{p.label}</span>
                              <span className="text-text-3">{p.group}</span>
                              <ArrowRight className="ml-auto size-3.5 text-text-3 opacity-0 group-data-[selected=true]:opacity-100" aria-hidden />
                            </Row>
                          );
                        })}
                      </Command.Group>
                    </Command.List>
                    <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-text-2">
                      <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
                      <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
                      <span className="ml-auto flex items-center gap-1.5"><Kbd>?</Kbd> all shortcuts</span>
                    </div>
                  </Command>
                </m.div>
              </RD.Content>
            </div>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}

function Row({ value, onSelect, delay, children }: { value: string; onSelect: () => void; delay: number; children: React.ReactNode }) {
  return (
    <Command.Item value={value} onSelect={onSelect} asChild>
      <m.div
        className="group flex h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm data-[selected=true]:bg-sunken"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0, transition: { duration: duration.fast, ease: ease.out, delay } }}
      >
        {children}
      </m.div>
    </Command.Item>
  );
}
