import { LoginForm } from "./login-form";
import { OfflineReset } from "./offline-reset";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/tenant-shared";

const ERRORS: Record<string, string> = {
  inactive: "Your account is not active. Ask the administrator to enable it.",
  expired: "You were signed out after 12 hours without activity. Sign in again.",
};

// The sign-in screen. On the shared page (/login) it shows the platform; on a
// business's own page (/login/<slug>) it shows that business's name, and the
// sign-in opens that business directly.
export function LoginScreen({ next, error, org }: { next?: string; error?: string; org?: { slug: string; name: string } }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <OfflineReset />
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-sm font-medium tracking-[0.2em] text-slate-300">{org ? org.name : PLATFORM_NAME}</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Stock, billing and collections in one place.
          </h1>
          <p className="mt-4 text-slate-400">
            {PLATFORM_TAGLINE} for the office, the warehouse and the field team.
          </p>
        </div>
        <p className="text-xs text-slate-500">Authorised staff only. All activity is logged.</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full border-[48px] border-accent-500/10" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo />
            <span className="text-sm font-semibold tracking-[0.2em] text-slate-700">{org ? org.name : PLATFORM_NAME}</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            {org ? `${org.name} · ${PLATFORM_NAME}` : "Use the login your administrator gave you."}
          </p>
          <LoginForm next={next} org={org?.slug} initialError={error ? ERRORS[error] : undefined} />
        </div>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#f28c18" />
      <path d="M9 23 16 8l7 15h-4l-3-7-3 7z" fill="#111a2e" />
    </svg>
  );
}
