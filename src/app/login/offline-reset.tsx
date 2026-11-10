"use client";

import { useEffect } from "react";
import { clearOfflineCopies } from "@/lib/offline-reset";

// Nobody is signed in on this page: whatever the previous person left on this
// device for offline use (pages, outlets, catalogue, drafts) is removed.
export function OfflineReset() {
  useEffect(() => {
    void clearOfflineCopies();
  }, []);
  return null;
}
