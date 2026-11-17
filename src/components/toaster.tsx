"use client";

import { Toaster } from "sonner";
import { usePrefs } from "./prefs-provider";

// One place for toasts: bottom-right on desktop, top on phones, styled from the theme.
export function AppToaster() {
  const { theme } = usePrefs();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      visibleToasts={4}
      gap={8}
      toastOptions={{
        classNames: {
          toast: "!rounded-[var(--radius-card)] !border !border-line !bg-raised !text-text !shadow-[var(--shadow-raised)] !font-sans",
          description: "!text-text-2",
          actionButton: "!bg-primary !text-on-fill !rounded-md",
          cancelButton: "!bg-sunken !text-text",
        },
      }}
    />
  );
}
