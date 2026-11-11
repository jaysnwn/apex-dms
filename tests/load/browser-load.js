// Load test run from a signed-in browser tab on the STAGING preview (read-only).
// How: open the preview, sign in as a user of two businesses (both.user), open the
// browser console, paste this file, then: await loadTest(25, 15)  (users, seconds).
// Each "user" repeats a mix of billing/salesman reads back to back (no pause),
// alternating businesses. Results: requests/second, median and 95th-percentile ms.
//
// cache: 'no-store' matters: without it Chrome lets only one request per URL wait
// for its cache at a time, which makes plain GETs look slow (a test artifact).
// One tab cannot open more than ~100 connections well; for more, use several machines.
//
// 11 Nov 2026 on staging, from India: 25 users 55 req/s, pages p50 0.7 s / p95 1.1 s,
// data p50 0.28 s; 50 users 114 req/s, same latencies; 100 users 162 req/s, pages
// p50 0.8 s / p95 1.3 s, data p50 0.46 s / p95 0.8 s; 0 errors. 200: the tab itself
// became the limit (server logged no slow requests).
async function loadTest(concurrency, seconds) {
  const SB = 'https://dkaknvrjoigsjbjxrcqr.supabase.co', KEY = 'sb_publishable_SFWN-S97hcvVNkPxeLbz8A_m4V3l8Jj';
  const T = { apex: 'a9e70000-0000-4000-8000-000000000001', iso: 'c0000000-0000-4000-8000-00000000000c' };
  const cookie = document.cookie.split('; ').filter((c) => c.startsWith('sb-dkaknvrjoigsjbjxrcqr-auth-token')).sort()
    .map((c) => decodeURIComponent(c.slice(c.indexOf('=') + 1))).join('');
  const session = JSON.parse(cookie.startsWith('base64-') ? atob(cookie.slice(7).replace(/-/g, '+').replace(/_/g, '/')) : cookie);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const api = (t, p, b) => fetch(SB + p, { cache: 'no-store', method: b ? 'POST' : 'GET',
    headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token, 'x-tenant-id': T[t], 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined });
  const page = (p) => fetch(p, { cache: 'no-store', headers: { RSC: '1' } });
  const ops = {
    product_search: (t) => api(t, '/rest/v1/rpc/search_catalog?select=id,name,sku', { p_words: pick([['charger'], ['65w'], ['cable'], ['power', 'bank']]), p_limit: 12, p_active: true, p_brand: null }),
    retailer_search: (t) => api(t, '/rest/v1/rpc/search_retailer_directory?select=id,shop_name', { p_words: pick([['om'], ['shop'], ['mobile']]) }),
    invoice_search: (t) => api(t, '/rest/v1/rpc/search_invoices?select=id,invoice_no', { p_words: pick([['00'], ['om']]) }),
    invoice_list: (t) => api(t, '/rest/v1/invoices?select=id,invoice_no,invoice_date,grand_total,status&order=invoice_date.desc&limit=50'),
    balances: (t) => api(t, '/rest/v1/retailer_balances?select=*&limit=50'),
    stock: (t) => api(t, '/rest/v1/stock_on_hand?select=*&limit=100'),
    page_invoices: () => page('/sales/invoices'),
    page_stock: () => page('/stock'),
  };
  const mix = ['product_search', 'product_search', 'product_search', 'retailer_search', 'retailer_search', 'invoice_search', 'invoice_list', 'balances', 'stock', 'page_invoices', 'page_stock'];
  const res = []; const end = performance.now() + seconds * 1000; let i = 0;
  const worker = async () => {
    while (performance.now() < end) {
      const op = pick(mix), t = (i++ % 2) ? 'iso' : 'apex', t0 = performance.now(); let ok = false, st = 0;
      try { const r = await ops[op](t); st = r.status; await r.arrayBuffer(); ok = r.ok; } catch { st = -1; }
      res.push({ op, ms: performance.now() - t0, ok, st });
    }
  };
  const t0 = performance.now(); await Promise.all(Array.from({ length: concurrency }, worker)); const dur = (performance.now() - t0) / 1000;
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : null; };
  const per = {}; for (const r of res) (per[r.op] ??= []).push(r.ms);
  return { concurrency, requests: res.length, perSecond: Math.round(res.length / dur), p50: q(res.map((r) => r.ms), 0.5), p95: q(res.map((r) => r.ms), 0.95),
    errors: res.filter((r) => !r.ok).length, per: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, `n=${v.length} p50=${q(v, 0.5)} p95=${q(v, 0.95)}`])) };
}
