"use client";

// Recently opened and pinned pages, kept on this device only (localStorage).
import { useEffect, useState } from "react";

export type PageRef = { href: string; title: string };
const RECENT_KEY = "dms_recent";
const PINNED_KEY = "dms_pinned";
const EVENT = "dms-nav-store";
const MAX_RECENT = 6;

function read(key: string): PageRef[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.href === "string" && typeof x.title === "string") : [];
  } catch {
    return [];
  }
}
function write(key: string, list: PageRef[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full or blocked: recent items are a convenience only */
  }
}

export function rememberPage(page: PageRef) {
  const list = read(RECENT_KEY).filter((p) => p.href !== page.href);
  write(RECENT_KEY, [page, ...list].slice(0, MAX_RECENT));
}

export function togglePin(page: PageRef) {
  const list = read(PINNED_KEY);
  const has = list.some((p) => p.href === page.href);
  write(PINNED_KEY, has ? list.filter((p) => p.href !== page.href) : [...list, page].slice(-8));
}

export function useNavStore() {
  const [state, set] = useState<{ recent: PageRef[]; pinned: PageRef[] }>({ recent: [], pinned: [] });
  useEffect(() => {
    const load = () => set({ recent: read(RECENT_KEY), pinned: read(PINNED_KEY) });
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return state;
}
