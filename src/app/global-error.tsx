"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Last line of defence: the whole app shell failed. Plain HTML and inline
// styles only, because the app's own styles may be what failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, display: "grid", placeItems: "center", minHeight: "100dvh", background: "#f8fafc" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#475569", fontSize: 14 }}>The app could not start. Anything you already saved is safe.</p>
          {error.digest && <p style={{ color: "#94a3b8", fontSize: 12 }}>Reference: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 12, height: 44, padding: "0 20px", borderRadius: 8, border: 0, background: "#111a2e", color: "#fff", fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
