"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUser, resetPassword, updateUser, type ActionState } from "./actions";
import { ROLE_LABELS, ROLES, type AppRole } from "@/lib/roles";
import { Alert, Button, Input, Label, Select } from "@/components/ui";

type BrandOpt = { id: string; name: string };

// Brand access: a user ticked for one brand only never sees the other brands' inventory.
function BrandBoxes({ brands, selected, idPrefix }: { brands: BrandOpt[]; selected: string[]; idPrefix: string }) {
  return (
    <div className="sm:col-span-2">
      <div className="mb-1.5 text-sm font-medium text-slate-700">Brand access <span className="font-normal text-slate-500">(Super Admin always has every brand)</span></div>
      <div className="flex flex-wrap gap-3">
        {brands.map((b) => (
          <label key={b.id} htmlFor={`${idPrefix}-${b.id}`} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium has-[:checked]:border-ink-900 has-[:checked]:bg-slate-50">
            <input id={`${idPrefix}-${b.id}`} type="checkbox" name="brand_ids" value={b.id} defaultChecked={selected.includes(b.id)} className="size-4" />
            {b.name}
          </label>
        ))}
      </div>
    </div>
  );
}

export function CreateUserForm({ brands }: { brands: BrandOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUser, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="new-name">Full name</Label>
        <Input id="new-name" name="full_name" required />
      </div>
      <div>
        <Label htmlFor="new-role">Role</Label>
        <Select id="new-role" name="role" defaultValue="salesman">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="new-email">Email (login)</Label>
        <Input id="new-email" name="email" type="email" required autoComplete="off" />
      </div>
      <div>
        <Label htmlFor="new-phone" hint="optional">Mobile</Label>
        <Input id="new-phone" name="phone" inputMode="numeric" maxLength={10} placeholder="10 digits" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="new-password" hint="min. 8 characters · not used if the email already has a login">Temporary password</Label>
        <Input id="new-password" name="password" type="text" minLength={8} autoComplete="new-password" />
      </div>
      <BrandBoxes brands={brands} selected={brands.map((b) => b.id)} idPrefix="new-brand" />
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add user"}</Button>
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="green">{state.ok}</Alert>}
      </div>
    </form>
  );
}

export type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  can_reimburse?: boolean;
  shared?: boolean;   // also works for another organization
};

export function EditUserForm({ user, isSelf, brands, brandIds }: { user: UserRow; isSelf: boolean; brands: BrandOpt[]; brandIds: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateUser, {});
  const [pwState, pwAction, pwPending] = useActionState<ActionState, FormData>(resetPassword, {});
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="id" value={user.id} />
        <div className="sm:col-span-2">
          <Label htmlFor={`name-${user.id}`} hint={user.shared ? "they change it themselves" : undefined}>Full name</Label>
          <Input id={`name-${user.id}`} name="full_name" defaultValue={user.full_name} required readOnly={user.shared} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`phone-${user.id}`} hint={user.shared ? "they change it themselves" : undefined}>Mobile</Label>
          <Input id={`phone-${user.id}`} name="phone" defaultValue={user.phone ?? ""} inputMode="numeric" maxLength={10} readOnly={user.shared} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`role-${user.id}`}>Role here</Label>
          <Select id={`role-${user.id}`} name="role" defaultValue={user.role}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`active-${user.id}`}>Status here</Label>
          <Select id={`active-${user.id}`} name="is_active" defaultValue={String(user.is_active)} disabled={isSelf}>
            <option value="true">Active — can work in this organization</option>
            <option value="false">Disabled — cannot work in this organization</option>
          </Select>
          {isSelf && <input type="hidden" name="is_active" value="true" />}
        </div>
        <div className="sm:col-span-4"><BrandBoxes brands={brands} selected={brandIds} idPrefix={`brand-${user.id}`} /></div>
        <label className="flex items-start gap-2 text-sm sm:col-span-4">
          <input type="checkbox" name="can_reimburse" value="true" defaultChecked={!!user.can_reimburse} className="mt-0.5 size-4 accent-ink-900" />
          <span><span className="font-medium">Can reimburse expenses</span><span className="block text-xs text-slate-500">Lets a Manager or Billing user pay employees for approved expenses. The Super Admin can always do this; salesmen and warehouse staff never can.</span></span>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          {!user.shared && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowPw((v) => !v)}>
              Reset password
            </Button>
          )}
          {state.error && <Alert>{state.error}</Alert>}
          {state.ok && <Alert tone="green">{state.ok}</Alert>}
        </div>
        {user.shared && (
          <p className="text-xs text-slate-500 sm:col-span-4">
            This person also works for another organization: their name, mobile and password are theirs to change.
          </p>
        )}
      </form>

      {showPw && !user.shared && (
        <form action={pwAction} className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-end">
          <input type="hidden" name="id" value={user.id} />
          <div className="flex-1">
            <Label htmlFor={`pw-${user.id}`}>New password</Label>
            <Input id={`pw-${user.id}`} name="password" type="text" minLength={8} required autoComplete="new-password" />
          </div>
          <Button type="submit" size="sm" disabled={pwPending}>{pwPending ? "Saving…" : "Set password"}</Button>
          {pwState.error && <Alert>{pwState.error}</Alert>}
          {pwState.ok && <Alert tone="green">{pwState.ok}</Alert>}
        </form>
      )}
    </div>
  );
}
