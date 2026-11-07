"use client";

import { useEffect, useState } from "react";
import { FileDown, Link2, MessageCircle } from "lucide-react";
import { shareOnWhatsApp } from "../(app)/share-actions";

// Sends the quotation to the shop on WhatsApp:
//  • "Send PDF on WhatsApp" (main, on phones that can share files): the shop gets the
//    PDF document itself — no link. The salesman picks WhatsApp, then the shop.
//  • "Send as link": opens the shop's WhatsApp chat directly with a short PDF link.
export function ShareQuote({ orderId, orderNo, mobile, fallbackText, compact = false }: { orderId: string; orderNo: string; mobile: string; fallbackText: string; compact?: boolean }) {
  const [busy, setBusy] = useState<"link" | "file" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const pdfUrl = `/api/pdf/quotation/${orderId}`;
  const fileName = `Quotation_${orderNo.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;

  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"], { type: "application/pdf" })], "q.pdf", { type: "application/pdf" });
      setCanShareFile(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFile(false);
    }
  }, []);

  async function sendLink() {
    setNote(null);
    setBusy("link");
    // Open the window inside the tap so phones don't block it, then point it at WhatsApp.
    const win = window.open("about:blank", "_blank");
    const res = await shareOnWhatsApp("quotation", orderId).catch(() => ({ url: undefined, error: "Network problem", localLink: false }));
    let url = res.url;
    if (!url) {
      url = `https://wa.me/91${mobile}?text=${encodeURIComponent(fallbackText)}`;
      setNote("The PDF link could not be made, so a text summary was sent instead.");
    } else if (res.localLink) {
      setNote("The link is long because the app is running on your computer. Once the app is online, links look like apex…/d/k3Xa9QpL.");
    }
    if (win) win.location.href = url;
    else window.location.href = url;
    setBusy(null);
  }

  async function sendFile() {
    setNote(null);
    setBusy("file");
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error("pdf");
      const file = new File([await res.blob()], fileName, { type: "application/pdf" });
      await navigator.share({ files: [file], title: `Quotation ${orderNo}`, text: fallbackText.split("\n")[0] });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setNote("Could not share the file. Use “Send as link” instead.");
    }
    setBusy(null);
  }

  const big = compact ? "h-12" : "h-14 text-lg";
  return (
    <div className="space-y-2">
      {canShareFile ? (
        <>
          <button onClick={sendFile} disabled={busy !== null} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-white shadow-md shadow-green-600/20 active:scale-[0.99] disabled:opacity-70 ${big}`}>
            <MessageCircle className="size-5" /> {busy === "file" ? "Preparing PDF…" : "Send PDF on WhatsApp"}
          </button>
          <p className="text-center text-[11px] text-slate-500">Then choose <b>WhatsApp</b> and the shop. The shop gets the PDF itself.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={sendLink} disabled={busy !== null} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-60">
              <Link2 className="size-4" /> {busy === "link" ? "Preparing…" : "Send as link"}
            </button>
            <a href={pdfUrl} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-300">
              <FileDown className="size-4" /> View PDF
            </a>
          </div>
        </>
      ) : (
        <>
          <button onClick={sendLink} disabled={busy !== null} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-white shadow-md shadow-green-600/20 active:scale-[0.99] disabled:opacity-70 ${big}`}>
            <MessageCircle className="size-5" /> {busy === "link" ? "Preparing quotation…" : "Send quotation on WhatsApp"}
          </button>
          <a href={pdfUrl} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-300">
            <FileDown className="size-4" /> View PDF
          </a>
        </>
      )}
      {note && <p className="text-center text-xs text-amber-700">{note}</p>}
    </div>
  );
}
