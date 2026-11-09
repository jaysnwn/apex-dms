"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "lucide-react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { RouteMapView, directionsUrl, parseLatLng, type MapStop } from "@/components/route-map";
import type { OutletInfo, Town } from "@/lib/route-data";
import { setRetailerLocation } from "../actions";

export function RouteMap({ towns, outlets }: { towns: Town[]; outlets: OutletInfo[] }) {
  const router = useRouter();
  const stops: MapStop[] = useMemo(() => outlets.map((o, i) => ({ o, n: i + 1 })).filter(({ o }) => o.latitude != null && o.longitude != null)
    .map(({ o, n }) => ({ id: o.retailer_id, label: o.shop_name, n, lat: Number(o.latitude), lng: Number(o.longitude),
      state: o.today ? (o.today.status === "completed" ? "done" : o.today.status === "missed" ? "missed" : o.today.status === "in_progress" ? "here" : "todo") : "none" })), [outlets]);
  const townPts = useMemo(() => towns.filter((t) => t.latitude != null && t.longitude != null).map((t) => ({ name: t.name, lat: Number(t.latitude), lng: Number(t.longitude) })), [towns]);
  const missing = outlets.filter((o) => o.latitude == null || o.longitude == null);
  const url = directionsUrl(stops);
  const [text, setText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <RouteMapView stops={stops} towns={townPts} />
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Numbers = visit order you set. The dashed line is the order, not the road.</span>
          {url && <a href={url} target="_blank" rel="noopener" className="ml-auto"><Button variant="secondary" size="sm"><Navigation className="size-4" /> Directions in Google Maps</Button></a>}
        </div>
      </div>
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="font-semibold">Shops without a location ({missing.length})</div>
          <div className="text-xs text-slate-500">Paste a Google Maps link or “lat, long”. Salesmen can also save it from the shop with GPS (once).</div>
        </div>
        {error && <div className="p-3"><Alert>{error}</Alert></div>}
        <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto text-sm">
          {missing.length === 0 && <li className="p-5 text-center text-slate-500">Every shop has a location.</li>}
          {missing.map((o) => {
            const ll = parseLatLng(text[o.retailer_id] ?? "");
            return (
              <li key={o.retailer_id} className="space-y-1.5 px-4 py-2.5">
                <div className="font-medium">{o.shop_name}</div>
                <div className="flex gap-2">
                  <Input value={text[o.retailer_id] ?? ""} onChange={(e) => setText((t) => ({ ...t, [o.retailer_id]: e.target.value }))} placeholder="19.5712, 74.2083" className="h-9" />
                  <Button size="sm" disabled={!ll || pending} onClick={() => start(async () => {
                    setError(null);
                    const r = await setRetailerLocation(o.retailer_id, ll!.lat, ll!.lng, null);
                    if (!r.ok) return setError(r.error);
                    router.refresh();
                  })}>Save</Button>
                </div>
                {text[o.retailer_id] && !ll && <div className="text-xs text-red-700">Could not read a location from that.</div>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
