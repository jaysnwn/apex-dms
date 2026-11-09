import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearTenantCookies } from "@/lib/tenant-switch";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The next person on this device starts without a business chosen.
  return clearTenantCookies(NextResponse.redirect(new URL("/login", request.url), { status: 303 }));
}
