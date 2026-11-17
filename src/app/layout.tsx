import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { NavProgress } from "@/components/nav-progress";
import { PrefsProvider } from "@/components/prefs-provider";
import { AppToaster } from "@/components/toaster";
import { ConfirmHost } from "@/components/confirm";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/tenant-shared";
import { readPrefs } from "@/lib/prefs";

export const metadata: Metadata = {
  title: { default: PLATFORM_NAME, template: `%s · ${PLATFORM_NAME}` },
  description: PLATFORM_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F6F8" },
    { media: "(prefers-color-scheme: dark)", color: "#121315" },
  ],
};

// Before first paint: follow the device when the theme is set to "system".
const systemThemeScript = `try{if(document.documentElement.dataset.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const prefs = readPrefs((n) => jar.get(n)?.value);
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}${prefs.theme === "dark" ? " dark" : ""}`}
      data-theme={prefs.theme}
      data-density={prefs.density}
      data-motion={prefs.motion}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: systemThemeScript }} />
      </head>
      <body>
        <PrefsProvider initial={prefs}>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          {children}
          <AppToaster />
          <ConfirmHost />
        </PrefsProvider>
      </body>
    </html>
  );
}
