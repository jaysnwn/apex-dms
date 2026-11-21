"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "./ui";
import { AsyncLabel } from "./async-label";

export type FormResult = { ok?: string; error?: string; redirectTo?: string; resetForm?: boolean };
type Action = (prev: FormResult, formData: FormData) => Promise<FormResult>;

// Small wrapper: runs a server action, shows its message, optionally navigates.
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  pendingLabel = "Saving…",
  className,
  submitVariant = "primary",
  footer,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  submitVariant?: "primary" | "secondary" | "danger";
  footer?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(action, {});
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  // A short tick on the button after a save, then back to the label.
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
    if (state.ok && state.resetForm) ref.current?.reset();
    if (state.ok) {
      setDone(true);
      const t = setTimeout(() => setDone(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant={submitVariant} disabled={pending}>
          <AsyncLabel state={pending ? "pending" : done ? "done" : "idle"} label={submitLabel} pendingLabel={pendingLabel} />
        </Button>
        {footer}
        {state.error && <div key={state.error} className="nudge"><Alert>{state.error}</Alert></div>}
        {state.ok && <Alert tone="green">{state.ok}</Alert>}
      </div>
    </form>
  );
}
