import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_NAME } from "@/lib/tenant-shared";

export const dynamic = "force-dynamic";

// Public short link for a shared document: /d/k3Xa9QpL → the PDF.
// Each open gets a fresh 10-minute signed URL; the code itself expires after 30 days.
// The page names the business that shared the document (no other data).
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return notFound(PLATFORM_NAME);
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("share_links").select("path, filename, expires_at, tenant_id").eq("code", code).maybeSingle();
    if (!data) return notFound(PLATFORM_NAME);
    const { data: org } = await admin.from("tenants").select("display_name").eq("id", data.tenant_id).maybeSingle();
    const name = (org?.display_name as string | undefined) ?? PLATFORM_NAME;
    // The file must sit in the folder of the business the link belongs to.
    if (!String(data.path).startsWith(`${data.tenant_id}/`)) return notFound(name);
    if (new Date(data.expires_at).getTime() < Date.now()) return notFound(name, `This link has expired. Please ask ${name} for a new copy.`);
    const { data: signed, error } = await admin.storage.from("documents").createSignedUrl(data.path, 600);
    if (error || !signed) return notFound(name);
    return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch {
    return notFound(PLATFORM_NAME);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function notFound(name: string, msg = "Document not found.") {
  const n = esc(name);
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${n}</title><body style="font-family:system-ui;padding:40px;text-align:center;color:#334155"><h2>${n}</h2><p>${esc(msg)}</p></body>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
