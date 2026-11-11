"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchSource, searchWords } from "@/lib/search-words";

// Thin wrappers: every rule (who may do what, no duplicates, history, warnings)
// lives in the database functions of migration 0018.

type R<T = object> = ({ ok: true } & T) | { ok?: false; error: string; hint?: string; detail?: string };
const uuid = z.string().guid();
const fail = (e: { message: string; hint?: string | null; details?: string | null }) => ({ error: e.message, hint: e.hint ?? undefined, detail: e.details ?? undefined });

function refresh(routeId?: string) {
  revalidatePath("/routes", "layout");
  if (routeId) revalidatePath(`/routes/manage/${routeId}`);
  revalidatePath("/m/route");
  revalidatePath("/m/routes", "layout");
}

const RouteInput = z.object({
  id: uuid.nullish(),
  name: z.string().trim().min(2, "Enter the route name").max(120),
  code: z.string().trim().max(20).optional().default(""),
  territoryId: uuid.nullish().or(z.literal("").transform(() => null)),
  description: z.string().max(500).optional().default(""),
  frequency: z.enum(["weekly", "fortnightly", "on_demand"]),
  days: z.array(z.number().int().min(1).max(7)).max(7),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal("").transform(() => null)),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  active: z.boolean(),
});

export async function saveRoute(input: z.input<typeof RouteInput>): Promise<R<{ id: string }>> {
  await requireRole("super_admin", "manager");
  const p = RouteInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const v = p.data;
  const sb = await createClient();
  const { data, error } = await sb.rpc("route_save", {
    p_id: v.id ?? null, p_name: v.name, p_code: v.code || null, p_territory_id: v.territoryId ?? null, p_description: v.description,
    p_visit_frequency: v.frequency, p_visit_days: [...new Set(v.days)].sort(), p_fortnight_anchor: v.anchor ?? null,
    p_sort_order: v.sortOrder, p_is_active: v.active,
  });
  if (error) return fail(error);
  refresh(data as string);
  return { ok: true, id: data as string };
}

export async function archiveRoute(id: string, archive: boolean, reason?: string): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_archive", { p_id: id, p_archive: archive, p_reason: reason ?? null });
  if (error) return fail(error);
  refresh(id);
  return { ok: true };
}

export async function setRouteTowns(routeId: string, locationIds: string[], opts: { moveTo?: string | null; removeOutlets?: boolean } = {}): Promise<R<{ affected: number }>> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { data, error } = await sb.rpc("route_set_locations", {
    p_route: routeId, p_location_ids: locationIds, p_move_to: opts.moveTo ?? null, p_remove_outlets: !!opts.removeOutlets,
  });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true, affected: Number((data as { outlets_affected: number }).outlets_affected ?? 0) };
}

export async function addOutlets(routeId: string, locationId: string | null, retailerIds: string[], move = false): Promise<R<{ added: number; moved: number; already: number }>> {
  await requireRole("super_admin", "manager");
  if (!retailerIds.length) return { error: "Choose retailers" };
  const sb = await createClient();
  const { data, error } = await sb.rpc("route_outlets_add", { p_route: routeId, p_location: locationId, p_retailer_ids: retailerIds, p_move: move });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true, ...(data as { added: number; moved: number; already: number }) };
}

export async function removeOutlet(routeId: string, retailerId: string, reason: string): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_outlet_remove", { p_route: routeId, p_retailer: retailerId, p_reason: reason || null });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function reorderOutlets(routeId: string, locationId: string | null, retailerIds: string[]): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_outlets_reorder", { p_route: routeId, p_location: locationId, p_retailer_ids: retailerIds });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function updateOutlet(routeId: string, retailerId: string, locationId: string | null, frequency: string, days: number[] | null): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_outlet_update", {
    p_route: routeId, p_retailer: retailerId, p_location: locationId, p_visit_frequency: frequency, p_visit_days: days && days.length ? days : null,
  });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function assignRoute(routeId: string, salesmanId: string, start: string, notes: string): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_assign", { p_route: routeId, p_salesman: salesmanId, p_start: start, p_notes: notes || null });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function unassignRoute(routeId: string, lastDay: string): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_unassign", { p_route: routeId, p_last_day: lastDay });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function pauseAssignment(routeId: string, paused: boolean): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_assignment_pause", { p_route: routeId, p_paused: paused });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function skipDay(routeId: string, day: string, reason: string, skip: boolean): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("route_skip_day", { p_route: routeId, p_date: day, p_reason: reason || null, p_skip: skip });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

export async function extraDay(routeId: string, salesmanId: string, day: string, notes: string): Promise<R> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const { error } = await sb.rpc("plan_route", { p_route_id: routeId, p_salesman_id: salesmanId, p_date: day, p_notes: notes || null });
  if (error) return fail(error);
  refresh(routeId);
  return { ok: true };
}

// ---------- towns & territories ----------
const PlaceInput = z.object({
  id: uuid.nullish(),
  name: z.string().trim().min(1, "Enter the name").max(80),
  territoryId: uuid.nullish().or(z.literal("").transform(() => null)),
  district: z.string().trim().max(80).optional().default(""),
  pincode: z.string().trim().regex(/^([1-9][0-9]{5})?$/, "PIN code must be 6 digits").optional().default(""),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  active: z.boolean().default(true),
});

export async function saveTown(input: z.input<typeof PlaceInput>): Promise<R<{ id: string }>> {
  await requireRole("super_admin", "manager");
  const p = PlaceInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const v = p.data;
  const row = { name: v.name, territory_id: v.territoryId ?? null, district: v.district || null, pincode: v.pincode || null,
    latitude: v.lat ?? null, longitude: v.lng ?? null, is_active: v.active };
  const sb = await createClient();
  const q = v.id ? sb.from("locations").update(row).eq("id", v.id).select("id").single() : sb.from("locations").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) return { error: error.code === "23505" ? "This town already exists in that territory" : error.message };
  refresh();
  return { ok: true, id: data.id as string };
}

export async function saveTerritory(input: { id?: string | null; name: string; code?: string; description?: string; active: boolean }): Promise<R<{ id: string }>> {
  await requireRole("super_admin", "manager");
  const name = input.name.trim();
  if (!name) return { error: "Enter the name" };
  const row = { name, code: input.code?.trim().toUpperCase() || null, description: input.description?.trim() || null, is_active: input.active };
  const sb = await createClient();
  const q = input.id ? sb.from("territories").update(row).eq("id", input.id).select("id").single() : sb.from("territories").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) return { error: error.code === "23505" ? "This territory already exists" : error.message };
  refresh();
  return { ok: true, id: data.id as string };
}

export async function setRetailerLocation(retailerId: string, lat: number, lng: number, accuracy: number | null): Promise<R> {
  await requireRole();
  const sb = await createClient();
  const { error } = await sb.rpc("set_retailer_location", { p_retailer: retailerId, p_lat: lat, p_lng: lng, p_accuracy: accuracy });
  if (error) return fail(error);
  revalidatePath(`/retailers/${retailerId}`);
  refresh();
  return { ok: true };
}

// Retailer picker for "Add outlets": search by shop, owner, mobile or town.
export type PickRetailer = { id: string; shop_name: string; owner_name: string | null; mobile: string; city: string | null; location_id: string | null; route_id: string | null; route_name: string | null; status: string };

export async function searchRetailers(q: string, locationId?: string | null): Promise<PickRetailer[]> {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const words = searchWords(q);
  let query = searchSource(sb, "retailers", "search_retailers", words)
    .select("id, shop_name, owner_name, mobile, billing_city, location_id, route_id, status, routes(name)")
    .neq("status", "inactive").order("shop_name").limit(60);
  if (locationId) query = query.eq("location_id", locationId);
  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id, shop_name: r.shop_name, owner_name: r.owner_name, mobile: r.mobile, city: r.billing_city, location_id: r.location_id,
    route_id: r.route_id, route_name: (r.routes as unknown as { name: string } | null)?.name ?? null, status: r.status,
  }));
}
