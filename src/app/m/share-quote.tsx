"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, Link2, MessageCircle } from "lucide-react";
import { shareOnWhatsApp } from "@/lib/share-actions";

// Sends the quotation to the shop on WhatsApp:
//  • "Send PDF on WhatsApp" (main, on phones that can share files): the shop gets the
//    PDF document itself — no link. The salesman picks WhatsApp, then the shop.
//  • "Send as link": opens the shop's WhatsApp chat directly with a short PDF link.
//
// A phone only opens its share sheet within a few seconds of the tap. Making the
// PDF can take longer than that on a slow connection, so the PDF is fetched as
// soon as this box appears; by the time the salesman taps, it is usually ready
// and the share sheet opens at once. If it was not ready and took long, the
// button turns into "PDF ready — tap to send" and the next tap opens the sheet.

// Past this the tap no longer counts as "just now" on some phones.
const TAP_WINDOW_MS = 3000;

type PdfState = { status: "loading" } | { status: "ready"; file: File } | { status: "failed" };

export function ShareQuote({ orderId, orderNo, mobile, fallbackText, compact = false }: { orderId: string; orderNo: string; mobile: string | null; fallbackText: string; compact?: boolean }) {
  const [busy, setBusy] = useState<"link" | "file" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const [pdf, setPdf] = useState<PdfState>({ status: "loading" });
  // The PDF was made after a slow tap: the next tap sends it.
  const [readyToSend, setReadyToSend] = useState(false);
  const pending = useRef<Promise<File | null> | null>(null);
  const pdfUrl = `/api/pdf/quotation/${orderId}`;
  const fileName = `Quotation_${orderNo.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;

  // Fetches the PDF once (a failed fetch is tried once more); later calls share the same download.
  const loadPdf = useCallback((): Promise<File | null> => {
    if (pending.current) return pending.current;
    const attempt = async () => {
      const res = await fetch(pdfUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`pdf ${res.status}`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("empty pdf");
      return new File([blob], fileName, { type: "application/pdf" });
    };
    const p = attempt()
      .catch(() => new Promise((r) => setTimeout(r, 1500)).then(attempt))
      .then((file) => {
        setPdf({ status: "ready", file });
        return file;
      })
      .catch(() => {
        setPdf({ status: "failed" });
        pending.current = null; // a later tap tries again
        return null;
      });
    pending.current = p;
    return p;
  }, [pdfUrl, fileName]);

  useEffect(() => {
    let can = false;
    try {
      const probe = new File([new Blob(["x"], { type: "application/pdf" })], "q.pdf", { type: "application/pdf" });
      can = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    } catch {
      can = false;
    }
    setCanShareFile(can);
    if (can) void loadPdf();
  }, [loadPdf]);

  async function shareFile(file: File) {
    try {
      await navigator.share({ files: [file], title: `Quotation ${orderNo}`, text: fallbackText.split("\n")[0] });
      setReadyToSend(false);
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "AbortError") return; // the salesman closed the share sheet
      if (name === "NotAllowedError") {
        // the phone decided the tap was too long ago: one more tap opens the sheet
        setReadyToSend(true);
        return;
      }
      setNote("Could not share the file. Use “Send as link” instead.");
    }
  }

  async function sendLink() {
    setNote(null);
    setBusy("link");
    // Open the window inside the tap so phones don't block it, then point it at WhatsApp.
    const win = window.open("about:blank", "_blank");
    const res = await shareOnWhatsApp("quotation", orderId).catch(() => ({ url: undefined, error: "Network problem", localLink: false }));
    let url = res.url;
    if (!url) {
      // no number saved for the shop: WhatsApp asks whom to send it to
      url = mobile ? `https://wa.me/91${mobile}?text=${encodeURIComponent(fallbackText)}` : `https://wa.me/?text=${encodeURIComponent(fallbackText)}`;
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
    // Ready: share straight inside this tap.
    if (pdf.status === "ready") {
      await shareFile(pdf.file);
      return;
    }
    setBusy("file");
    const tappedAt = Date.now();
    const file = await loadPdf();
    setBusy(null);
    if (!file) {
      setNote("The PDF could not be made right now. Check the internet, or use “Send as link”.");
      return;
    }
    if (Date.now() - tappedAt <= TAP_WINDOW_MS) await shareFile(file);
    else setReadyToSend(true);
  }

  const big = compact ? "h-12" : "h-14 text-lg";
  const fileLabel =
    busy === "file" ? "Preparing PDF…" : readyToSend ? "PDF ready — tap to send" : "Send PDF on WhatsApp";
  return (
    <div className="space-y-2">
      {canShareFile ? (
        <>
          <button onClick={sendFile} disabled={busy !== null} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-on-fill shadow-md active:scale-[0.99] disabled:opacity-70 ${big}`}>
            <MessageCircle className="size-5" /> {fileLabel}
          </button>
          <p className="text-center text-xs text-slate-500">
            {pdf.status === "loading" && busy === null && !readyToSend
              ? "Getting the PDF ready…"
              : <>Then choose <b>WhatsApp</b> and the shop. The shop gets the PDF itself.</>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={sendLink} disabled={busy !== null} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-60">
              <Link2 className="size-4" /> {busy === "link" ? "Preparing…" : "Send as link"}
            </button>
            <a href={pdfUrl} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-semibold text-slate-700 ring-1 ring-slate-300">
              <FileDown className="size-4" /> View PDF
            </a>
          </div>
        </>
      ) : (
        <>
          <button onClick={sendLink} disabled={busy !== null} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-on-fill shadow-md active:scale-[0.99] disabled:opacity-70 ${big}`}>
            <MessageCircle className="size-5" /> {busy === "link" ? "Preparing quotation…" : "Send quotation on WhatsApp"}
          </button>
          <a href={pdfUrl} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-sm font-semibold text-slate-700 ring-1 ring-slate-300">
            <FileDown className="size-4" /> View PDF
          </a>
        </>
      )}
      {note && <p className="text-center text-xs text-amber-700">{note}</p>}
    </div>
  );
}
