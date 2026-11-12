"use client";

import { useState, useTransition } from "react";
import { FileDown, MessageCircle } from "lucide-react";
import { Button } from "./ui";
import { shareOnWhatsApp } from "@/lib/share-actions";
import type { PdfKind } from "@/pdf/kinds";

// "PDF" and "WhatsApp" buttons for any document.
export function DocButtons({ kind, id, query = "", size = "md", label = "PDF" }: { kind: PdfKind; id: string; query?: string; size?: "sm" | "md"; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const href = `/api/pdf/${kind}/${id}${query ? `?${query}` : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={href} target="_blank" rel="noopener" className={`inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white font-medium hover:bg-slate-50 ${size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm"}`}>
        <FileDown className="size-4" /> {label}
      </a>
      <Button
        size={size}
        className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            // Open the tab synchronously-ish so mobile browsers don't block it.
            const res = await shareOnWhatsApp(kind, id, query);
            if (res.url) window.open(res.url, "_blank", "noopener");
            else setError(res.error ?? "Could not share");
          })
        }
      >
        <MessageCircle className="size-4" /> {pending ? "Preparing…" : "WhatsApp"}
      </Button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  );
}
