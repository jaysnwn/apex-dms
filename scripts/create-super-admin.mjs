// One-time bootstrap: creates the first Super Administrator.
// Usage (reads .env.local):
//   node --env-file=.env.local scripts/create-super-admin.mjs you@example.com "Your Name" "StrongPassword123"
import { createClient } from "@supabase/supabase-js";

const [email, fullName, password] = process.argv.slice(2);
if (!email || !fullName || !password) {
  console.error('Usage: node --env-file=.env.local scripts/create-super-admin.mjs <email> "<full name>" <password>');
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

const { data, error } = await admin.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  app_metadata: { role: "super_admin" },
  user_metadata: { full_name: fullName },
});

if (error) {
  console.error("Could not create user:", error.message);
  process.exit(1);
}
console.log(`Super Administrator created: ${data.user.email} (${data.user.id})`);
