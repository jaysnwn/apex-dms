"use client";

// Orders saved on the phone while offline, sent automatically when the
// network is back. Each has a one-time id, so a resend never duplicates.
//
// Everything kept on the phone is kept per business (tenant) and per person
// (see tenantKey): on a shared phone nobody sees or sends another person's
// orders. Per business as well: a salesman who
// works for two distributors never sends one's orders into the other, and
// never sees one's cached catalogue in the other. Each queued order also
// carries its business, and the server refuses it in any other business.
import { currentTenantId, currentUserId, tenantKey } from "@/lib/supabase/client";
import { APEX_TENANT_ID } from "@/lib/tenant-shared";
import type { QuoteInput } from "./actions";

export type OutboxItem = {
  id: string;
  kind: "order";
  data: QuoteInput;
  shop: string;
  total: number;
  at: string;
  tenantId?: string;
  userId?: string;
  error?: string;
};

const BASE = "dms-m-outbox";
const EVENT = "dms-outbox";

// Before multi-tenancy everything on the phone belonged to APEX TRADING CO.
// Move anything still unsent into Apex's own space, once; drop old caches.
const LEGACY = { outbox: "apex-m-outbox", caches: ["apex-m-catalogue", "apex-m-outlets", "apex-m-draft"] };
function moveLegacyData() {
  try {
    if (currentTenantId() !== APEX_TENANT_ID) return;
    const old = localStorage.getItem(LEGACY.outbox);
    if (old) {
      const items = (JSON.parse(old) as OutboxItem[]).map((i) => ({ ...i, tenantId: APEX_TENANT_ID, data: { ...i.data, tenantId: APEX_TENANT_ID } }));
      const now = JSON.parse(localStorage.getItem(tenantKey(BASE)) ?? "[]") as OutboxItem[];
      localStorage.setItem(tenantKey(BASE), JSON.stringify([...now.filter((n) => !items.some((i) => i.id === n.id)), ...items]));
      localStorage.removeItem(LEGACY.outbox);
    }
    LEGACY.caches.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage blocked */
  }
}

export function readOutbox(): OutboxItem[] {
  moveLegacyData();
  try {
    return JSON.parse(localStorage.getItem(tenantKey(BASE)) ?? "[]") as OutboxItem[];
  } catch {
    return [];
  }
}

export function writeOutbox(items: OutboxItem[]) {
  try {
    localStorage.setItem(tenantKey(BASE), JSON.stringify(items));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToOutbox(item: OutboxItem) {
  const tenantId = currentTenantId() ?? undefined;
  const userId = currentUserId() ?? undefined;
  const stamped = { ...item, tenantId, userId, data: { ...item.data, tenantId, userId } };
  writeOutbox([...readOutbox().filter((i) => i.id !== item.id), stamped]);
}

export function onOutboxChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

// Small caches (catalogue, outlets, draft), also per business.
export function cacheGet<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(tenantKey(key));
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(tenantKey(key), JSON.stringify(value));
  } catch {
    /* storage full */
  }
}

export function cacheRemove(key: string) {
  try {
    localStorage.removeItem(tenantKey(key));
  } catch {
    /* ignore */
  }
}
