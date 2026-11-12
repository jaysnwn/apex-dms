// Minimal browser stand-ins, then the real tenantKey / offline-reset logic.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: () => null };
Object.defineProperty(globalThis.localStorage, "length", { get: () => store.size });
Object.keys = ((orig) => (o) => o === globalThis.localStorage ? [...store.keys()] : orig(o))(Object.keys);
let cookie = "";
globalThis.document = { get cookie() { return cookie; } };
globalThis.window = {};
const T = "a9e70000-0000-4000-8000-000000000001", A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const { tenantKey } = await import("./build/client.mjs");
const { clearOfflineCopies, unsentCount } = await import("./build/offline-reset.mjs");
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok ", m); };
store.set(`dms-m-outbox:${T}`, JSON.stringify([{ id: "old" }]));            // pre-existing, per business only
cookie = `dms_tenant=${T}; dms_uid=${A}`;
const ka = tenantKey("dms-m-outbox");
ok(ka === `dms-m-outbox:${T}:${A}`, "key is per business and person");
ok(store.get(ka) === JSON.stringify([{ id: "old" }]) && !store.has(`dms-m-outbox:${T}`), "old per-business queue handed to the person signed in, once");
store.set(tenantKey("dms-m-catalogue"), "[1,2,3]");
store.set(`apex.recentProducts.brand1:${T}:${A}`, "[\"p1\"]");
store.set("unrelated-site-key", "x");
cookie = `dms_tenant=${T}; dms_uid=${B}`;
ok(store.get(tenantKey("dms-m-outbox")) === undefined, "the next person does not see the previous person's queue");
ok(store.get(tenantKey("dms-m-catalogue")) === undefined, "nor their catalogue");
ok(unsentCount(A) === 1 && unsentCount(B) === 0, "unsent count is per person");
await clearOfflineCopies();
ok(!store.has(`dms-m-catalogue:${T}:${A}`), "sign-out clears caches");
ok(!store.has(`apex.recentProducts.brand1:${T}:${A}`), "and billing's recent products");
ok(store.has("unrelated-site-key"), "and nothing that is not ours");
ok(store.has(`dms-m-outbox:${T}:${A}`), "but keeps unsent work under its author");
