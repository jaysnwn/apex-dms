"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPdf, type PdfKind } from "@/pdf/render";

// Renders the PDF (with the caller's permissions), stores it privately and
// returns a WhatsApp link containing a 7-day download link for the retailer.
export async function shareOnWhatsApp(kind: PdfKind, id: string, query = ""): Promise<{ url?: string; error?: string }> {
  await requireRole();
  const pdf = await renderPdf(kind, id, new URLSearchParams(query));
  if (!pdf) return { error: "Document not found." };

  let link = "";
  try {
    const admin = createAdminClient();
    const path = `${kind}/${id}/${pdf.filename}`;
    const { error: upErr } = await admin.storage.from("documents").upload(path, pdf.buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;
    const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 7 * 24 * 3600, { download: pdf.filename });
    if (error) throw error;
    link = data.signedUrl;
  } catch {
    return { error: "Could not prepare the PDF link. Check SUPABASE_SERVICE_ROLE_KEY in .env.local." };
  }

  const phone = pdf.phone ? `91${pdf.phone.replace(/\D/g, "").slice(-10)}` : "";
  const text = `${pdf.shareText}\n\nDownload PDF: ${link}`;
  return { url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
}
