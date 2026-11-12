import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavProgress } from "@/components/nav-progress";

export const metadata: Metadata = {
  title: { default: "APEX DMS", template: "%s · APEX DMS" },
  description: "Distribution Management System for APEX TRADING CO.",
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
