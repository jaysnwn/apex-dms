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
export function LoginScreen({ next, error, org }: { next?: string; error?: string; org?: { slug: string; name: string; logoUrl?: string | null } }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <OfflineReset />
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,#0A3A8C_0%,#0F55C2_55%,#1A6CDD_100%)] p-12 text-white lg:flex">
        {/* soft light behind the glass */}
        <div aria-hidden className="drift pointer-events-none absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-[#5AA2FF]/40 blur-3xl" />
        <div aria-hidden className="drift pointer-events-none absolute -right-28 -bottom-32 h-[30rem] w-[30rem] rounded-full bg-[#38C3B5]/25 blur-3xl [animation-delay:-7s]" />
        {org?.logoUrl ? (
          <div className="rise relative inline-flex w-fit rounded-[var(--radius-sheet)] bg-white/90 px-5 py-3 shadow-[var(--shadow-raised)] ring-1 ring-white/60 backdrop-blur-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={org.logoUrl} alt={org.name} className="h-14 w-auto max-w-72 object-contain brightness-[1.04] contrast-[1.04] mix-blend-multiply" />
          </div>
        ) : (
          <div className="rise relative flex items-center gap-3">
            <Logo />
            <span className="text-sm font-medium tracking-[0.2em] text-white/85">{org ? org.name : PLATFORM_NAME}</span>
          </div>
        )}
        <div className="rise relative bg-white/14 ring-1 ring-white/25 backdrop-blur-md max-w-md rounded-[var(--radius-sheet)] p-7 [animation-delay:120ms]">
          <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.02em]">
            Stock, billing and collections in one place.
          </h1>
          <p className="mt-3 text-white/85">
            {PLATFORM_TAGLINE} for the office, the warehouse and the field team.
          </p>
        </div>
        <p className="rise relative text-xs text-white/80 [animation-delay:240ms]">Authorised staff only. All activity is logged.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="rise w-full max-w-sm [animation-delay:80ms]">
          {org?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt={org.name} className="mb-8 h-14 w-auto max-w-full object-contain mix-blend-multiply lg:hidden dark:mix-blend-screen dark:invert dark:hue-rotate-180" />
          ) : (
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Logo />
              <span className="text-sm font-semibold tracking-[0.2em] text-text-2">{org ? org.name : PLATFORM_NAME}</span>
            </div>
          )}
          <h2 className="text-2xl font-semibold tracking-[-0.015em] text-text">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-text-2">
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
      <rect width="32" height="32" rx="9" fill="var(--blue-600)" />
      <path d="M9 23 16 8l7 15h-4l-3-7-3 7z" fill="var(--on-fill)" />
    </svg>
  );
}
