"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, IndianRupee, LogIn, MapPin, Navigation, Phone, ShoppingCart } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { date, inr } from "@/lib/format";
import { GEO_STATUS, VISIT_STATUS } from "@/lib/status";
import type { OutletInfo, Town } from "@/lib/route-data";
import { saveVisit } from "../../../(app)/routes/actions";

function position(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
}

export function RouteOutlets({ towns, outlets }: { towns: Town[]; outlets: OutletInfo[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = [
    ...towns.map((t) => ({ key: t.id, name: t.name, list: outlets.filter((o) => o.location_id === t.id) })),
    { key: "none", name: "No town set", list: outlets.filter((o) => !o.location_id || !towns.some((t) => t.id === o.location_id)) },
  ].filter((g) => g.list.length > 0 || g.key !== "none");
  let n = 0;

  async function checkIn(o: OutletInfo) {
    if (!navigator.onLine) return setError("You are offline. Open Today's route to work offline.");
    setBusy(o.retailer_id); setError(null);
    const p = await position();
    const r = await saveVisit({ clientUuid: crypto.randomUUID(), visitId: o.today?.visit_id ?? null, retailerId: o.retailer_id, action: "checkin", lat: p?.lat ?? null, lng: p?.lng ?? null, accuracy: p?.accuracy ?? null, at: new Date().toISOString() });
    setBusy(null);
    if (r.error) return setError(r.error);
    router.push("/m/route");
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-600"><MapPin className="size-4" /> {g.name} <span className="font-normal text-slate-400">· {g.list.length}</span></h2>
          {g.list.length === 0 && <p className="px-1 text-sm text-slate-400">No shops here yet.</p>}
          <ul className="space-y-2.5">
            {g.list.map((o) => {
              n += 1;
              const t = o.today;
              const st = t ? VISIT_STATUS[t.status] : null;
              const nav = o.latitude != null ? `https://www.google.com/maps/dir/?api=1&destination=${o.latitude},${o.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.shop_name} ${o.address}`)}`;
              return (
                <li key={o.retailer_id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
                  <div className="p-3.5">
                    <div className="flex items-start gap-2">
                      <span className="tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{n}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/m/outlets/${o.retailer_id}`} className="font-semibold">{o.shop_name}</Link>
                        <div className="truncate text-xs text-slate-500">{[o.mobile, o.address].filter(Boolean).join(" · ")}</div>
                      </div>
                      {st ? <Badge tone={st.tone}>{st.label}</Badge> : <span className="text-[11px] text-slate-400">not today</span>}
                    </div>
                    {t?.geo_status && <div className="mt-1 pl-8"><Badge tone={GEO_STATUS[t.geo_status].tone}>{GEO_STATUS[t.geo_status].label}</Badge></div>}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-center">
                      <div className="rounded-lg bg-slate-50 p-1.5"><div className="text-[10px] text-slate-500">Outstanding</div><div className="tabular text-sm font-semibold">{inr(o.outstanding, { decimals: false })}</div></div>
                      <div className={cn("rounded-lg p-1.5", o.overdue > 0 ? "bg-red-50" : "bg-slate-50")}><div className="text-[10px] text-slate-500">Overdue</div><div className={cn("tabular text-sm font-semibold", o.overdue > 0 ? "text-red-700" : "text-slate-400")}>{inr(o.overdue, { decimals: false })}</div></div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500">
                      Visited {o.last_visit ? date(o.last_visit) : "—"} · ordered {o.last_order ? `${date(o.last_order.date)} (${inr(o.last_order.amount, { decimals: false })})` : "—"} · paid {o.last_payment ? `${date(o.last_payment.date)} (${inr(o.last_payment.amount, { decimals: false })})` : "—"}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 border-t border-slate-100 text-[11px] font-medium">
                    <a href={`tel:${o.mobile}`} className="flex flex-col items-center gap-0.5 py-2 text-slate-700"><Phone className="size-4" /> Call</a>
                    <a href={nav} target="_blank" rel="noopener" className="flex flex-col items-center gap-0.5 py-2 text-slate-700"><Navigation className="size-4" /> Go</a>
                    <a href={`/api/pdf/statement/${o.retailer_id}`} target="_blank" rel="noopener" className="flex flex-col items-center gap-0.5 py-2 text-slate-700"><FileText className="size-4" /> Statement</a>
                    <Link href={`/m/outlets/${o.retailer_id}`} className="flex flex-col items-center gap-0.5 py-2 text-emerald-700"><IndianRupee className="size-4" /> Collect</Link>
                    <Link href={`/m/order?retailer=${o.retailer_id}`} className="flex flex-col items-center gap-0.5 py-2 font-semibold text-accent-600"><ShoppingCart className="size-4" /> Order</Link>
                  </div>
                  {(!t || t.status === "planned" || t.status === "in_progress") && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-2">
                      {t ? (
                        <Link href="/m/route" className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white">{t.status === "in_progress" ? "Finish the visit in Today's route" : "Visit in Today's route"}</Link>
                      ) : (
                        <button onClick={() => checkIn(o)} disabled={busy === o.retailer_id} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-blue-700 ring-1 ring-blue-200 disabled:opacity-60">
                          <LogIn className="size-4" /> {busy === o.retailer_id ? "Getting GPS…" : "Check in now (not planned today)"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
