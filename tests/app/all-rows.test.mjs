// Lists that feed totals must be complete (audit finding 3): allRows() pages
// past Supabase's 1,000-row answer limit, and the row-cap watch reports any
// other list that came back exactly full.
const { allRows } = await import("./build/all-rows.mjs");
const { capWatchingFetch } = await import("./build/row-cap.mjs");
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok ", m); };

const table = (n) => { const calls = []; return { calls, make: () => ({ range: async (a, b) => { calls.push([a, b]); return { data: Array.from({ length: Math.max(0, Math.min(n, b + 1) - a) }, (_, i) => a + i), error: null }; } }) }; };
for (const n of [0, 1, 999, 1000, 1001, 2500]) {
  const t = table(n);
  const { data } = await allRows(t.make);
  ok(data.length === n && new Set(data).size === n && t.calls.length === Math.floor(n / 1000) + 1, `${n} rows: all ${n} returned, in ${t.calls.length} request(s)`);
}
let threw = false;
try { await allRows(() => ({ range: async () => ({ data: null, error: { message: "boom" } }) })); } catch { threw = true; }
ok(threw, "a database error stops the page instead of giving a short total");

const real = globalThis.fetch;
const answer = (range) => new Response("[]", { headers: range ? { "content-range": range } : {} });
const watch = async (url, init, range) => { const seen = []; globalThis.fetch = async () => answer(range); await capWatchingFetch((t) => seen.push(t))(url, init); globalThis.fetch = real; return seen; };
const base = "https://x.supabase.co/rest/v1/";
ok((await watch(base + "invoices?select=id", {}, "0-999/*")).join() === "invoices", "a full, unpaged answer is reported with the table name");
ok((await watch(base + "payments?select=id", {}, "0-41/*")).length === 0, "a short answer is not reported");
ok((await watch(base + "orders?select=id&limit=1000", {}, "0-999/*")).length === 0, "a list that asked for a limit is not reported");
ok((await watch(base + "visits?select=id", { headers: { Range: "0-999" } }, "0-999/*")).length === 0, "a paged request is not reported");
ok((await watch(base + "retailers", { method: "POST" }, "0-999/*")).length === 0, "saving is not reported");
ok((await watch(base + "rpc/reorder_suggestions", { method: "POST" }, "0-999/*")).join() === "rpc/reorder_suggestions", "a full answer from a database function is reported");
const twice = []; globalThis.fetch = async () => answer("0-999/*"); const f = capWatchingFetch((t) => twice.push(t));
await f(base + "products?select=id", {}); await f(base + "products?select=id", {}); globalThis.fetch = real;
ok(twice.length === 1, "the same list is reported once an hour, not on every request");
