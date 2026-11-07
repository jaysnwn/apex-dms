"use client";

import { useEffect, useRef, useState } from "react";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// Hidden one-time key for a form. A double click / resubmit sends the same key
// (the server saves once); after a successful save the form resets and gets a new key.
export function IdempotencyKey({ name = "client_uuid" }: { name?: string }) {
  const [id, setId] = useState(newId);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const renew = () => setId(newId());
    form.addEventListener("reset", renew);
    return () => form.removeEventListener("reset", renew);
  }, []);
  return <input ref={ref} type="hidden" name={name} value={id} readOnly />;
}
