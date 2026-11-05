import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil, Phone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr, RETAILER_CLASS_LABELS, RETAILER_STATUS_LABELS } from "@/lib/format";
import { GST_STATES } from "@/lib/states";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { LinkButton } from "@/components/chip";

export const metadata: Metadata = { title: "Retailer" };

const STATUS_TONE = { active: "green", on_hold: "amber", blocked: "red", inactive: "slate" } as const;

export default async function RetailerPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireRole();
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase.from("retailer_directory").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: bal } = await supabase.from("retailer_balances").select("*").eq("retailer_id", id).maybeSingle();
  const canEdit = ["super_admin", "manager", "billing"].includes(profile.role);

  const address = (a: string | null, city: string | null, pin: string | null) =>
    [a, [city, pin].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—";

  const summary = [
    { label: "Outstanding", value: Number(bal?.outstanding ?? 0) },
    { label: "Not yet due", value: Number(bal?.not_yet_due ?? 0) },
    { label: "Due today", value: Number(bal?.due_today ?? 0) },
    { label: "Overdue", value: Number(bal?.overdue ?? 0), tone: "red" as const },
  ];
  const ageing = [
    ["0–15 days", bal?.overdue_0_15],
    ["16–30 days", bal?.overdue_16_30],
    ["31–45 days", bal?.overdue_31_45],
    ["45+ days", bal?.overdue_45_plus],
  ] as const;

  return (
    <>
      <PageHeader
        title={r.shop_name}
        description={`${r.code}${r.owner_name ? ` · ${r.owner_name}` : ""}`}
        actions={
          <>
            <a href={`tel:${r.mobile}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
              <Phone className="size-4" /> Call
            </a>
            {canEdit && <LinkButton href={`/retailers/${id}/edit`}><Pencil className="size-4" /> Edit</LinkButton>}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{RETAILER_STATUS_LABELS[r.status]}</Badge>
        {r.classification && <Badge tone="blue">{RETAILER_CLASS_LABELS[r.classification]}</Badge>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-sm text-slate-500">{s.label}</div>
            <div className={cn("tabular mt-1 text-xl font-semibold", s.tone === "red" && s.value > 0 && "text-red-700")}>{inr(s.value)}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Profile</h2>
          <dl className="space-y-2 text-sm">
            <Row k="Mobile" v={<a href={`tel:${r.mobile}`} className="hover:underline">{r.mobile}</a>} />
            {r.alt_mobile && <Row k="Alternate mobile" v={r.alt_mobile} />}
            <Row k="GSTIN" v={r.gstin ?? "Unregistered"} />
            <Row k="State" v={`${r.billing_state_code} · ${GST_STATES[r.billing_state_code] ?? ""}`} />
            <Row k="Billing address" v={address(r.billing_address, r.billing_city, r.billing_pincode)} />
            <Row k="Delivery address" v={r.delivery_address || r.delivery_city ? address(r.delivery_address, r.delivery_city, r.delivery_pincode) : "Same as billing"} />
            <Row k="Route" v={r.route_name ?? "—"} />
            <Row k="Salesman" v={r.salesman_name ?? "—"} />
            <Row k="Credit period" v={`${r.credit_days} days`} />
            <Row k="Credit limit" v={Number(r.credit_limit) > 0 ? inr(r.credit_limit) : "No limit"} />
            <Row k="Customer since" v={date(r.created_at)} />
          </dl>
          {r.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-600">{r.notes}</p>}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Overdue ageing</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {ageing.map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className={cn("tabular font-semibold", Number(v ?? 0) > 0 && "text-red-700")}>{inr(v ?? 0, { decimals: false })}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-semibold">History</h2>
            <ul className="space-y-2 text-sm text-slate-500">
              <li>Orders and invoices appear here from M2.</li>
              <li>Payments, allocations, promises and the account statement from M4.</li>
              <li>Visits and salesman remarks from M5.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
