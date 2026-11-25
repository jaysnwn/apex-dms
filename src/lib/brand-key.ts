import "server-only";
import { createHash } from "node:crypto";

// One cart can hold several brands, but one order / invoice is for one brand.
// Each brand's order gets its own idempotency key, derived from the cart's key,
// so resending the same cart returns the same orders. The first brand keeps the
// cart's own key.
export function brandKey(clientUuid: string, brandId: string, first: boolean) {
  if (first) return clientUuid;
  const h = createHash("sha256").update(`${clientUuid}:${brandId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
