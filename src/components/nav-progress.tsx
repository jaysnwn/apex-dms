"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A thin bar at the top that starts the moment a link is tapped (or a search
// form is sent) and finishes when the new page is on screen, so a tap always
// gets instant feedback, even before a page's own skeleton appears.
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = () => {
      if (timer.current) return;
      setVisible(true);
      setWidth(0.15);
      // creeps towards 90 % and waits there for the page
      timer.current = setInterval(() => setWidth((w) => Math.min(0.9, w + (0.9 - w) * 0.12)), 200);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (!e.defaultPrevented && (f.method || "get").toLowerCase() === "get") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // the new page is here
  useEffect(() => {
    if (!timer.current) return;
    clearInterval(timer.current);
    timer.current = null;
    setWidth(1);
    const t = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return <div aria-hidden className="nav-progress" style={{ transform: `scaleX(${width})`, opacity: visible ? 1 : 0 }} />;
}
