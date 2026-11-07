"use client";

import { useEffect, useState } from "react";
import { FileDown, MessageCircle, Share2 } from "lucide-react";
import { shareOnWhatsApp } from "../(app)/share-actions";

// Sends the quotation PDF to the shop:
//  1. WhatsApp (chat with the shop opens with a message + PDF link), or
//  2. Share the PDF file itself (Android/iPhone share sheet → WhatsApp → contact).
export function ShareQuote({ orderId, orderNo, mobile, fallbackText, compact = false }: { orderId: string; orderNo: string; mobile: string; fallbackText: string; compact?: boolean }) {
  const [busy, setBusy] = useState<"wa" | "file" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const pdfUrl = `/api/pdf/quotation/${orderId}`;

  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"], { type: "application/pdf" })], "q.pdf", { type: "application/pdf" });
      setCanShareFile(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFile(false);
    }
  }, []);

  async function whatsapp() {
    setNote(null);
    setBusy("wa");
    // Open the window right away (inside the tap) so phones don't block it.
    const win = window.open("about:blank", "_blank");
    const res = await shareOnWhatsApp("quotation", orderId).catch(() => ({ url: undefined, error: "Network problem" }));
    let url = res.url;
    if (!url) {
      url = `https://wa.me/91${mobile}?text=${encodeURIComponent(fallbackText)}`;
      setNote("PDF link could not be made, so a text summary was sent instead.");
    }
    if (win) win.location.href = url;
    else window.location.href = url;
    setBusy(null);
  }

  async function shareFile() {
    setNote(null);
    setBusy("file");
    try {
      const blob = await (await fetch(pdfUrl)).blob();
      const file = new File([blob], `Quotation_${orderNo.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`, { type: "application/pdf" });
      await navigator.share({ files: [file], title: `Quotation ${orderNo}`, text: fallbackText.split("\n")[0] });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setNote("Could not share the file. Use the WhatsApp button instead.");
    }
    setBusy(null);
  }

  return (
    <div className="space-y-2">
      <button onClick={whatsapp} disabled={busy !== null} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-white shadow-md shadow-green-600/20 active:scale-[0.99] disabled:opacity-70 ${compact ? "h-12" : "h-14 text-lg"}`}>
        <MessageCircle className="size-5" /> {busy === "wa" ? "Preparing quotation…" : "Send quotation on WhatsApp"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {canShareFile ? (
          <button onClick={shareFile} disabled={busy !== null} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-60">
            <Share2 className="size-4" /> {busy === "file" ? "Preparing…" : "Share PDF file"}
          </button>
        ) : <span />}
        <a href={pdfUrl} target="_blank" rel="noopener" className={`flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-300 ${canShareFile ? "" : "col-span-2"}`}>
          <FileDown className="size-4" /> View PDF
        </a>
      </div>
      {note && <p className="text-center text-xs text-amber-700">{note}</p>}
    </div>
  );
}
