"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, LocateFixed, Store } from "lucide-react";
import { cn } from "@/components/ui";
import { addOutlet } from "../../actions";

export function OutletForm({ routes, defaultRoute, thenOrder }: { routes: { id: string; name: string }[]; defaultRoute: string; thenOrder: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ shop_name: "", owner_name: "", mobile: "", city: "", address: "", pincode: "", gstin: "", route_id: defaultRoute });
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<{ code: string; shop_name: string; city: string | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  function locate() {
    if (!("geolocation" in navigator)) return setError("This phone cannot share location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setLocating(false); },
      () => { setError("Could not get location. Allow location for this app and try again."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function save(force = false) {
    setError(null);
    if (!navigator.onLine) return setError("No internet. Connect and try again.");
    setBusy(true);
    const res = await addOutlet({ ...f, latitude: gps?.lat ?? null, longitude: gps?.lng ?? null, force });
    setBusy(false);
    if (res.similar) return setSimilar(res.similar);
    if (res.error) return setError(res.error);
    router.push(thenOrder ? `/m/order?retailer=${res.id}` : `/m/outlets/${res.id}`);
    router.refresh();
  }

  const input = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15";
  return (
    <div className="space-y-4">
      <Link href={thenOrder ? "/m/order" : "/m/outlets"} className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> Back</Link>
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-12 place-items-center rounded-2xl bg-violet-600 text-white"><Store className="size-6" /></span>
        <div><h1 className="text-xl font-bold">New outlet</h1><p className="text-sm text-slate-500">Only 4 fields are needed</p></div>
      </div>

      <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <Field label="Shop name" required><input className={input} value={f.shop_name} onChange={set("shop_name")} placeholder="e.g. Sai Mobile Shoppee" autoFocus /></Field>
        <Field label="Owner name"><input className={input} value={f.owner_name} onChange={set("owner_name")} /></Field>
        <Field label="Mobile" required><input className={cn(input, "tabular")} value={f.mobile} onChange={set("mobile")} inputMode="tel" maxLength={14} placeholder="10-digit mobile" /></Field>
        <Field label="Village / city" required><input className={input} value={f.city} onChange={set("city")} /></Field>
        {routes.length > 0 && (
          <Field label="Route" required>
            <select className={input} value={f.route_id} onChange={set("route_id")}>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
      </section>

      <button onClick={locate} className={cn("flex w-full items-center gap-3 rounded-2xl p-4 text-left ring-1", gps ? "bg-emerald-50 ring-emerald-300" : "bg-white ring-slate-200")}>
        <span className={cn("grid size-11 place-items-center rounded-xl text-white", gps ? "bg-emerald-600" : "bg-sky-600")}>{gps ? <Check className="size-6" /> : <LocateFixed className={cn("size-6", locating && "animate-pulse")} />}</span>
        <span className="flex-1">
          <span className="block font-semibold">{gps ? "Shop location saved" : locating ? "Getting location…" : "Save shop location"}</span>
          <span className="block text-xs text-slate-500">{gps ? `Accurate to about ${gps.acc} m. Tap to update.` : "Stand at the shop and tap. Helps with directions."}</span>
        </span>
      </button>

      <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">More details (optional)</summary>
        <div className="mt-3 space-y-3">
          <Field label="Address"><input className={input} value={f.address} onChange={set("address")} placeholder="Shop no., street, landmark" /></Field>
          <Field label="PIN code"><input className={cn(input, "tabular")} value={f.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} /></Field>
          <Field label="GSTIN"><input className={cn(input, "font-mono uppercase")} value={f.gstin} onChange={set("gstin")} maxLength={15} /></Field>
        </div>
      </details>

      {similar && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Similar shops already exist:</p>
          <ul className="mt-1 list-disc pl-5">{similar.map((s) => <li key={s.code}>{s.shop_name} ({s.code}){s.city ? `, ${s.city}` : ""}</li>)}</ul>
          <p className="mt-2">If this is a different shop, save anyway.</p>
          <button onClick={() => save(true)} className="mt-2 h-10 rounded-xl bg-amber-600 px-4 font-semibold text-white">Save anyway</button>
        </div>
      )}
      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <button disabled={busy} onClick={() => save(false)} className="h-14 w-full rounded-2xl bg-violet-600 text-lg font-bold text-white shadow-md shadow-violet-600/30 disabled:opacity-60">
        {busy ? "Saving…" : thenOrder ? "Save and take order" : "Save outlet"}
      </button>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}
