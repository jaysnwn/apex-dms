// PostgREST filter for "warehouses these brands may use": the shared warehouse
// (no brand) plus any warehouse of one of these brands. Use with .or(...).
export function warehouseOr(brandIds: string[]): string {
  const ids = brandIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length ? `brand_id.is.null,brand_id.in.(${ids.join(",")})` : "brand_id.is.null";
}
