"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPdf, type PdfKind } from "@/pdf/render";

const LINK_DAYS = 30;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no look-alikes (0/O, 1/l/I)

function shortCode(len = 8) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// The public address of this app, for links sent to retailers.
// Set NEXT_PUBLIC_APP_URL (e.g. https://dms.yourdomain.in) once the app is online.
async function appOrigin() {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

const isLocal = (origin: string) => /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin) || !origin;

// Renders the PDF (with the caller's permissions), stores it privately and
// returns a WhatsApp link with a short download link for the retailer:
//   https://<app>/d/k3Xa9QpL   (valid 30 days, re-signed on every open)
export async function shareOnWhatsApp(kind: PdfKind, id: string, query = ""): Promise<{ url?: string; error?: string; localLink?: boolean }> {
  const { user, tenant } = await requireRole();
  // Rendered with the caller's own permissions, inside their business.
  const pdf = await renderPdf(kind, id, new URLSearchParams(query));
  if (!pdf) return { error: "Document not found." };

  let link = "";
  let localLink = false;
  try {
    const admin = createAdminClient();
    // The service key bypasses every database rule, so the business is named
    // explicitly here: its own storage folder, and the link row carries it.
    const path = `${tenant.id}/${kind}/${id}/${pdf.filename}`;
    const { error: upErr } = await admin.storage.from("documents").upload(path, pdf.buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const origin = await appOrigin();
    if (isLocal(origin)) {
      // Running on this computer: a short link to it would not open on the shop's phone,
      // so use the (long) storage link until the app is online.
      const { data, error } = await admin.storage.from("documents").createSignedUrl(path, LINK_DAYS * 24 * 3600, { download: pdf.filename });
      if (error) throw error;
      link = data.signedUrl;
      localLink = true;
    } else {
      // Reuse an existing, still-valid short link for the same document.
      const { data: existing } = await admin.from("share_links").select("code").eq("tenant_id", tenant.id).eq("path", path).gt("expires_at", new Date(Date.now() + 864e5).toISOString()).limit(1).maybeSingle();
      let code = existing?.code as string | undefined;
      if (!code) {
        for (let i = 0; i < 3 && !code; i++) {
          const c = shortCode();
          const { error } = await admin.from("share_links").insert({ tenant_id: tenant.id, code: c, path, filename: pdf.filename, expires_at: new Date(Date.now() + LINK_DAYS * 864e5).toISOString(), created_by: user.id });
          if (!error) code = c;
        }
      }
      if (!code) throw new Error("no code");
      link = `${origin}/d/${code}`;
    }
  } catch {
    return { error: "Could not prepare the PDF link. Check SUPABASE_SERVICE_ROLE_KEY in .env.local." };
  }

  const phone = pdf.phone ? `91${pdf.phone.replace(/\D/g, "").slice(-10)}` : "";
  const text = `${pdf.shareText}\n\nPDF: ${link}`;
  return { url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, localLink };
}
