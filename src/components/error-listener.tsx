"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Errors that happen outside a page's own error screen (in a click handler, a
// background sync, a failed promise) are sent to the error log too.
export function ErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
