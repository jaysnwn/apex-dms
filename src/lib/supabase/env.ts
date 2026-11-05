// Central place for Supabase environment variables.
// The URL and publishable key are public (they ship to every browser), so the
// apex-dms project's values are built in as defaults. .env.local / Vercel env
// values override them. The service-role key is secret and is NEVER defaulted.

const DEFAULT_URL = "https://uiczjglzsnjxxqvxlheh.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_ynSsR07qBVByHUrymntoaw_SlmIM9aT";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_PUBLISHABLE_KEY;

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}
