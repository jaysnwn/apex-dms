import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const { profile } = await requireRole();

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-3xl gap-6">
        <Card className="p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">{profile.full_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium">{ROLE_LABELS[profile.role]}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email (login)</dt>
              <dd className="font-medium">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Mobile</dt>
              <dd className="font-medium">{profile.phone || "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">Ask the Super Administrator to change your name, role or mobile.</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Change password</h2>
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}
