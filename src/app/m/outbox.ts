"use client";

// Orders saved on the phone while offline, sent automatically when the
// network is back. Each has a one-time id, so a resend never duplicates.
import type { QuoteInput } from "./actions";

export type OutboxItem = { id: string; kind: "order"; data: QuoteInput; shop: string; total: number; at: string; error?: string };

const KEY = "apex-m-outbox";
const EVENT = "apex-outbox";

export function readOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxItem[];
  } catch {
    return [];
  }
}

export function writeOutbox(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToOutbox(item: OutboxItem) {
  writeOutbox([...readOutbox().filter((i) => i.id !== item.id), item]);
}

export function onOutboxChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function cacheGet<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full */
  }
}
