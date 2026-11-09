"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { parseLatLng } from "@/components/route-map";
import { saveTerritory, saveTown } from "../manage/actions";

type Territory = { id: string; name: string; code: string | null; description: string | null; is_active: boolean };
type TownRow = { id: string; name: string; territory_id: string | null; district: string | null; pincode: string | null; latitude: number | null; longitude: number | null; is_active: boolean };

export function PlacesEditor({ territories, towns, routesOf, shops }: { territories: Territory[]; towns: TownRow[]; routesOf: Record<string, string[]>; shops: Record<string, number> }) {
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [editTown, setEditTown] = useState<TownRow | "new" | null>(null);
  const [editTerr, setEditTerr] = useState<Territory | "new" | null>(null);
  const tName = new Map(territories.map((t) => [t.id, t.name]));
  const list = towns.filter((t) => (!filter || (filter === "none" ? !t.territory_id : t.territory_id === filter)) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search towns" className="w-56" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48" aria-label="Territory">
            <option value="">All territories</option><option value="none">No territory</option>
            {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Button className="ml-auto" onClick={() => { setEditTown("new"); setEditTerr(null); }}><Plus className="size-4" /> Town / village</Button>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Town / village</th><th className="px-3 py-2.5">Territory</th><th className="px-3 py-2.5">On routes</th><th className="px-3 py-2.5 text-right">Shops</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No towns yet.</td></tr>}
              {list.map((t) => (
                <tr key={t.id} className={cn(!t.is_active && "text-slate-400")}>
                  <td className="px-4 py-2"><span className="font-medium">{t.name}</span>{!t.is_active && <span className="ml-1"><Badge>Disabled</Badge></span>}<div className="text-xs text-slate-500">{[t.district, t.pincode, t.latitude != null ? "GPS saved" : null].filter(Boolean).join(" · ")}</div></td>
                  <td className="px-3 py-2">{tName.get(t.territory_id ?? "") ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{routesOf[t.id]?.join(", ") ?? <span className="text-slate-400">none</span>}</td>
                  <td className="tabular px-3 py-2 text-right">{shops[t.id] ?? 0}</td>
                  <td className="px-4 py-2 text-right"><button className="text-sm text-accent-700 hover:underline" onClick={() => { setEditTown(t); setEditTerr(null); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="space-y-4">
        {editTown && <TownForm key={editTown === "new" ? "new" : editTown.id} town={editTown === "new" ? null : editTown} territories={territories} onDone={() => setEditTown(null)} />}
        {editTerr && <TerritoryForm key={editTerr === "new" ? "new" : editTerr.id} territory={editTerr === "new" ? null : editTerr} onDone={() => setEditTerr(null)} />}
        <Card className="overflow-hidden">
          <div className="flex items-center border-b border-slate-100 px-4 py-3"><span className="font-semibold">Territories</span><button className="ml-auto text-sm text-accent-700 hover:underline" onClick={() => { setEditTerr("new"); setEditTown(null); }}>+ Add</button></div>
          <ul className="divide-y divide-slate-100 text-sm">
            {territories.length === 0 && <li className="p-5 text-center text-slate-500">No territories yet.</li>}
            {territories.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-4 py-2">
                <span className={cn("flex-1", !t.is_active && "text-slate-400")}><span className="font-medium">{t.name}</span> {t.code && <span className="font-mono text-xs text-slate-500">{t.code}</span>}</span>
                <span className="text-xs text-slate-500">{towns.filter((x) => x.territory_id === t.id).length} towns</span>
                <button className="text-sm text-accent-700 hover:underline" onClick={() => { setEditTerr(t); setEditTown(null); }}>Edit</button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TownForm({ town, territories, onDone }: { town: TownRow | null; territories: Territory[]; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(town?.name ?? "");
  const [territory, setTerritory] = useState(town?.territory_id ?? "");
  const [district, setDistrict] = useState(town?.district ?? "");
  const [pincode, setPincode] = useState(town?.pincode ?? "");
  const [ll, setLl] = useState(town?.latitude != null ? `${town.latitude}, ${town.longitude}` : "");
  const [active, setActive] = useState(town?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parsed = ll.trim() ? parseLatLng(ll) : null;
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">{town ? `Edit ${town.name}` : "New town or village"}</h3>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div><Label>Territory</Label><Select value={territory} onChange={(e) => setTerritory(e.target.value)}><option value="">—</option>{territories.filter((t) => t.is_active || t.id === territory).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label hint="optional">District / taluka</Label><Input value={district} onChange={(e) => setDistrict(e.target.value)} /></div>
          <div><Label hint="optional">PIN code</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" maxLength={6} /></div>
        </div>
        <div><Label hint="optional — Google Maps link or lat, long">Town centre location</Label><Input value={ll} onChange={(e) => setLl(e.target.value)} placeholder="19.5712, 74.2083" />
          {ll.trim() && !parsed && <p className="mt-1 text-xs text-red-700">Could not read a location.</p>}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink-900" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex gap-2">
        <Button disabled={pending || (!!ll.trim() && !parsed)} onClick={() => start(async () => {
          const r = await saveTown({ id: town?.id ?? null, name, territoryId: territory, district, pincode, lat: parsed?.lat ?? null, lng: parsed?.lng ?? null, active });
          if (!r.ok) return setError(r.error);
          onDone(); router.refresh();
        })}>{pending ? "Saving…" : "Save"}</Button>
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}

function TerritoryForm({ territory, onDone }: { territory: Territory | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(territory?.name ?? "");
  const [code, setCode] = useState(territory?.code ?? "");
  const [description, setDescription] = useState(territory?.description ?? "");
  const [active, setActive] = useState(territory?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">{territory ? `Edit ${territory.name}` : "New territory"}</h3>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Junnar belt" autoFocus /></div>
        <div><Label hint="optional">Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} className="font-mono" /></div>
        <div><Label hint="optional">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink-900" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use</label>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await saveTerritory({ id: territory?.id ?? null, name, code, description, active });
          if (!r.ok) return setError(r.error);
          onDone(); router.refresh();
        })}>{pending ? "Saving…" : "Save"}</Button>
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}
