import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavProgress } from "@/components/nav-progress";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/tenant-shared";

export const metadata: Metadata = {
  title: { default: PLATFORM_NAME, template: `%s · ${PLATFORM_NAME}` },
  description: PLATFORM_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111a2e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
