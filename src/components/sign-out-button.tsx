"use client";

import { useState, type ReactNode } from "react";
import { currentUserId } from "@/lib/supabase/client";
import { clearOfflineCopies, unsentCount } from "@/lib/offline-reset";

// Sign-out that first removes this device's offline copies. Unsent work stays
// on the phone under its author and is sent when they sign in again; they are
// told so before signing out.
export function SignOutButton({ className, children }: { className?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const unsent = unsentCount(currentUserId());
        if (unsent > 0 && !window.confirm(`${unsent} item(s) are not sent yet. They stay on this phone and are sent the next time you sign in. Sign out now?`)) return;
        setBusy(true);
        await clearOfflineCopies();
        form.submit();
      }}
    >
      <button type="submit" disabled={busy} className={className}>
        {children}
      </button>
    </form>
  );
}
