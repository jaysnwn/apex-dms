"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "./dialog";
import { Button } from "./ui";

// A styled replacement for window.confirm(): `if (await askConfirm("Cancel this count?")) …`.
// Same yes/no decision as before; it just looks like the app, works with the keyboard and
// can't be blocked by the browser.
type Ask = { message: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };
const EVENT = "dms-confirm";

export function askConfirm(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<Ask>(EVENT, { detail: { message, ...opts, resolve } }));
  });
}

export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const on = (e: Event) => setAsk((e as CustomEvent<Ask>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (ask) setTimeout(() => okRef.current?.focus(), 30);
  }, [ask]);
  if (!ask) return null;
  const done = (ok: boolean) => {
    ask.resolve(ok);
    setAsk(null);
  };
  return (
    <Dialog title="Please confirm" onClose={() => done(false)}>
      <p className="text-[15px] leading-relaxed text-text">{ask.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => done(false)}>Go back</Button>
        <Button ref={okRef} variant={ask.danger ? "danger" : "primary"} onClick={() => done(true)}>{ask.confirmLabel ?? "Yes, continue"}</Button>
      </div>
    </Dialog>
  );
}
