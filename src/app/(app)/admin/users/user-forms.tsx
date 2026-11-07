"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUser, resetPassword, updateUser, type ActionState } from "./actions";
import { ROLE_LABELS, ROLES, type AppRole } from "@/lib/roles";
import { Alert, Button, Input, Label, Select } from "@/components/ui";

type BrandOpt = { id: string; name: string };

// Brand access: a user ticked for CONQRETE only never sees BLUEI inventory.
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
        <Label htmlFor="new-password" hint="min. 8 characters">Temporary password</Label>
        <Input id="new-password" name="password" type="text" required minLength={8} autoComplete="new-password" />
      </div>
      <BrandBoxes brands={brands} selected={brands.map((b) => b.id)} idPrefix="new-brand" />
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create user"}</Button>
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="green">{state.ok}</Alert>}
      </div>
    </form>
  );
}

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
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
          <Label htmlFor={`name-${user.id}`}>Full name</Label>
          <Input id={`name-${user.id}`} name="full_name" defaultValue={user.full_name} required />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`phone-${user.id}`}>Mobile</Label>
          <Input id={`phone-${user.id}`} name="phone" defaultValue={user.phone ?? ""} inputMode="numeric" maxLength={10} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`role-${user.id}`}>Role</Label>
          <Select id={`role-${user.id}`} name="role" defaultValue={user.role}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`active-${user.id}`}>Status</Label>
          <Select id={`active-${user.id}`} name="is_active" defaultValue={String(user.is_active)} disabled={isSelf}>
            <option value="true">Active — can sign in</option>
            <option value="false">Disabled — cannot sign in</option>
          </Select>
          {isSelf && <input type="hidden" name="is_active" value="true" />}
        </div>
        <div className="sm:col-span-4"><BrandBoxes brands={brands} selected={brandIds} idPrefix={`brand-${user.id}`} /></div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowPw((v) => !v)}>
            Reset password
          </Button>
          {state.error && <Alert>{state.error}</Alert>}
          {state.ok && <Alert tone="green">{state.ok}</Alert>}
        </div>
      </form>

      {showPw && (
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
