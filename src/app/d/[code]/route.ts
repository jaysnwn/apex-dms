import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Public short link for a shared document: /d/k3Xa9QpL → the PDF.
// Each open gets a fresh 10-minute signed URL; the code itself expires after 30 days.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return notFound();
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("share_links").select("path, filename, expires_at").eq("code", code).maybeSingle();
    if (!data || new Date(data.expires_at).getTime() < Date.now()) return notFound("This link has expired. Please ask APEX TRADING CO. for a new copy.");
    const { data: signed, error } = await admin.storage.from("documents").createSignedUrl(data.path, 600);
    if (error || !signed) return notFound();
    return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch {
    return notFound();
  }
}

function notFound(msg = "Document not found.") {
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>APEX TRADING CO.</title><body style="font-family:system-ui;padding:40px;text-align:center;color:#334155"><h2>APEX TRADING CO.</h2><p>${msg}</p></body>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
