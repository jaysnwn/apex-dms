import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { stockReportPdf, stockVerificationXlsx } from "@/lib/stock-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stock/pdf?brand=<id>[&warehouse=<id>][&value=1]   → stock report PDF
// GET /api/stock/xlsx?brand=<id>[&warehouse=<id>]            → stock verification Excel
export async function GET(request: NextRequest, { params }: { params: Promise<{ format: string }> }) {
  const session = await getSession();
  const p = session?.profile;
  if (!p?.is_active || !["super_admin", "manager", "billing", "warehouse"].includes(p.role)) return new NextResponse("Not allowed", { status: 403 });
  const { format } = await params;
  const q = request.nextUrl.searchParams;
  const brandId = q.get("brand");
  if (!brandId) return new NextResponse("Choose a brand", { status: 400 });
  const opts = { brandId, warehouseId: q.get("warehouse"), withValue: q.get("value") === "1" && p.role !== "warehouse", userName: p.full_name || p.email || "" };

  const file = format === "pdf" ? await stockReportPdf(opts) : format === "xlsx" ? await stockVerificationXlsx(opts) : null;
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `${format === "pdf" && !q.get("download") ? "inline" : "attachment"}; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
