import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { renderPdf, type PdfKind } from "@/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: PdfKind[] = ["invoice", "credit-note", "receipt", "statement", "picking", "purchase-order", "quotation", "delivery-note"];

// GET /api/pdf/invoice/<id>  (add ?download=1 to download instead of view)
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const session = await getSession();
  if (!session?.profile?.is_active) return new NextResponse("Sign in required", { status: 401 });
  const { kind, id } = await params;
  if (!KINDS.includes(kind as PdfKind)) return new NextResponse("Unknown document", { status: 404 });

  const pdf = await renderPdf(kind as PdfKind, id, request.nextUrl.searchParams);
  if (!pdf) return new NextResponse("Not found", { status: 404 });

  const disposition = request.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
