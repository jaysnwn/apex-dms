"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type PasswordState } from "./actions";
import { Alert, Button, Input, Label } from "@/components/ui";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-4 sm:max-w-sm">
      <div>
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="password" hint="10+ characters, letters and numbers">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div>
        <Label htmlFor="confirm">Repeat new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="green">{state.ok}</Alert>}
    </form>
  );
}
