import "server-only";

// Small in-memory cache for files printed on every PDF (the business logo, brand
// logos). Fetching them from storage took a network trip on every PDF; a warm
// server now reuses the bytes. Keyed by storage path, which includes the
// business's own folder, and a path is only looked up after the caller's own
// (RLS-checked) query returned it. Entries expire so a logo replaced under the
// same file name shows up within a few minutes.
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 50;

type Entry = { at: number; value: Promise<Buffer | null> };
const store = new Map<string, Entry>();

export function cachedFile(key: string, load: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = load().catch(() => null);
  store.set(key, { at: now, value });
  // a file that could not be read is not kept, so the next PDF tries again
  void value.then((v) => {
    if (v === null && store.get(key)?.value === value) store.delete(key);
  });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  return value;
}
