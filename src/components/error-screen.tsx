"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Shown in place of a page that failed to load. The rest of the app (menu,
// other pages) keeps working; "Try again" reloads just this page. Nothing is
// lost: saving happens only when the server confirms it.
export function ErrorScreen({ error, reset, home = "/dashboard", compact = false }: {
  error: Error & { digest?: string };
  reset: () => void;
  home?: string;
  compact?: boolean;
}) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  useEffect(() => {
    if (!offline) reportError(error);
  }, [error, offline]);

  return (
    <div role="alert" className={compact ? "p-4" : "mx-auto max-w-lg py-16"}>
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-red-700">
          <AlertTriangle className="size-5" />
          <h2 className="font-semibold">{offline ? "No internet connection" : "This page could not be loaded"}</h2>
        </div>
        <p className="text-sm text-slate-600">
          {offline
            ? "Check the network and try again. Anything you already saved is safe."
            : "Something went wrong on our side. Try again; if it keeps happening, tell your administrator. Anything you already saved is safe."}
        </p>
        {error.digest && <p className="mt-2 text-xs text-slate-400">Reference: {error.digest}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white active:opacity-90"
          >
            <RotateCw className="size-4" /> Try again
          </button>
          <Link href={home} className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">
            Go to start
          </Link>
        </div>
      </div>
    </div>
  );
}
