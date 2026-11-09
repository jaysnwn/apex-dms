// Bootstrap: creates the first Super Administrator of one organization (tenant).
// Usage (reads .env.local):
//   node --env-file=.env.local scripts/create-super-admin.mjs you@example.com "Your Name" "StrongPassword123" [org-slug]
// org-slug defaults to the only organization; with several it is required.
import { createClient } from "@supabase/supabase-js";

const [email, fullName, password, slug] = process.argv.slice(2);
if (!email || !fullName || !password) {
  console.error('Usage: node --env-file=.env.local scripts/create-super-admin.mjs <email> "<full name>" <password> [org-slug]');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let q = admin.from("tenants").select("id, slug, display_name").in("status", ["trial", "active"]);
if (slug) q = q.eq("slug", slug.toLowerCase());
const { data: tenants, error: tErr } = await q;
if (tErr) {
  console.error("Could not read organizations:", tErr.message);
  process.exit(1);
}
if (!tenants?.length) {
  console.error(slug ? `No active organization with slug "${slug}".` : "No active organization exists.");
  process.exit(1);
}
if (tenants.length > 1) {
  console.error("Several organizations exist; pass the org slug: " + tenants.map((t) => t.slug).join(", "));
  process.exit(1);
}
const tenant = tenants[0];

const { data, error } = await admin.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  // the database makes the user a member of this organization only
  app_metadata: { role: "super_admin", tenant_id: tenant.id },
  user_metadata: { full_name: fullName },
});

if (error) {
  console.error("Could not create user:", error.message);
  process.exit(1);
}
console.log(`Super Administrator of ${tenant.display_name} created: ${data.user.email} (${data.user.id})`);
