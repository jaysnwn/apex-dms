"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapStop = { id: string; label: string; n: number; lat: number; lng: number; state?: "done" | "missed" | "here" | "todo" | "none" };
export type MapPerson = { id: string; label: string; lat: number; lng: number; live: boolean; note: string };

const COLOR = { done: "#059669", missed: "#dc2626", here: "#2563eb", todo: "#d97706", none: "#475569" } as const;

// OpenStreetMap with the stops numbered in the order the office set (a straight dashed
// line joins them — it is the visit order, not a road route) and salesmen's positions.
export function RouteMapView({ stops, people = [], towns = [], height = 420 }: {
  stops: MapStop[]; people?: MapPerson[]; towns?: { name: string; lat: number; lng: number }[]; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const pts: [number, number][] = [];
      const ordered = [...stops].sort((a, b) => a.n - b.n);
      if (ordered.length > 1) L.polyline(ordered.map((s) => [s.lat, s.lng] as [number, number]), { color: "#64748b", weight: 2, dashArray: "6 6" }).addTo(map);
      for (const s of ordered) {
        const c = COLOR[s.state ?? "none"];
        const icon = L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
          html: `<div style="background:${c};color:#fff;width:26px;height:26px;border-radius:999px;display:grid;place-items:center;font:600 12px system-ui;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.n}</div>` });
        L.marker([s.lat, s.lng], { icon }).addTo(map).bindTooltip(`${s.n}. ${s.label}`);
        pts.push([s.lat, s.lng]);
      }
      for (const t of towns) {
        L.circleMarker([t.lat, t.lng], { radius: 5, color: "#0f172a", weight: 1, fillOpacity: 0.2 }).addTo(map).bindTooltip(t.name, { permanent: false });
        pts.push([t.lat, t.lng]);
      }
      for (const p of people) {
        const icon = L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;border-radius:999px;background:${p.live ? "#7c3aed" : "#94a3b8"};border:3px solid #fff;box-shadow:0 0 0 2px ${p.live ? "#7c3aed" : "#94a3b8"}"></div>` });
        L.marker([p.lat, p.lng], { icon }).addTo(map).bindTooltip(`${p.label} — ${p.note}`);
        pts.push([p.lat, p.lng]);
      }
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
      else map.setView([20.59, 78.96], 5); // no stops yet: show India
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [stops, people, towns]);
  return <div ref={box} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-slate-200" />;
}

// Google Maps directions through the stops in order (Google allows up to 9 stops in between).
export function directionsUrl(stops: { lat: number; lng: number }[]) {
  if (!stops.length) return null;
  const p = (s: { lat: number; lng: number }) => `${s.lat},${s.lng}`;
  const dest = stops[stops.length - 1];
  const mid = stops.slice(0, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&destination=${p(dest)}${mid.length ? `&waypoints=${encodeURIComponent(mid.map(p).join("|"))}` : ""}&travelmode=driving`;
}

// Reads "19.57, 74.21" or a Google Maps link (…@19.57,74.21… or …q=19.57,74.21…).
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
