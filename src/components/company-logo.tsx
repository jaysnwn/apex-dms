"use client";

import { useState } from "react";

// The business's logo; if it cannot load (offline, removed), its name instead.
export function CompanyLogo({ src, name, className, fallbackClassName }: { src: string; name: string; className?: string; fallbackClassName?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={fallbackClassName ?? "truncate text-sm font-semibold tracking-wide text-slate-900"}>{name}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className={className} onError={() => setFailed(true)} />;
}
