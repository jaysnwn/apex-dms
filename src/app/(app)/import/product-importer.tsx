"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Trash2, XCircle } from "lucide-react";
import { PRODUCT_COLUMNS, guessMapping, parseCsv } from "@/lib/import-columns";
import { checkRows, type ImportContext } from "@/lib/product-import";
import { Alert, Badge, Button, Card, cn } from "@/components/ui";
import { BrandSwitcher } from "@/components/brand-switcher";
import { importProducts, prepareProductImport, type ImportResult } from "./actions";

type Brand = { id: string; name: string; code: string };
type Row = Record<string, string> & { __row: string };
const COLS = PRODUCT_COLUMNS.filter((c) => c.key !== "brand");
const SHOW = ["name", "sku", "category", "hsn_code", "unit_code", "gst_rate", "purchase_cost", "distributor_price", "retailer_price", "mrp", "opening_qty", "min_stock_qty"];

// Step 1 template → 2 upload → 3 check columns → 4 preview & fix → 5 import valid rows.
export function ProductImporter({ brand, brands, canSeeAll }: { brand: Brand | null; brands: Brand[]; canSeeAll: boolean }) {
  const [file, setFile] = useState<{ name: string; headers: string[]; body: unknown[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ctx, setCtx] = useState<ImportContext | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const checks = useMemo(() => (rows && ctx ? checkRows(rows, ctx) : []), [rows, ctx]);
  const bad = checks.filter((c) => c.errors.length).length;
  const good = (rows?.length ?? 0) - bad;
  const updates = checks.filter((c) => !c.errors.length && c.isUpdate).length;

  if (!brand) {
    return (
      <Card className="max-w-xl p-6">
        <h2 className="font-semibold">Which brand are these products for?</h2>
        <p className="mb-4 text-sm text-slate-500">CONQRETE and BLUEI have separate catalogues. Import one brand at a time.</p>
        <BrandSwitcher brands={brands} currentId={null} canSeeAll={false} />
      </Card>
    );
  }

  async function downloadTemplate() {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    type Data = import("write-excel-file/browser").SheetData;
    const header = COLS.map((c) => ({ value: c.required ? `${c.header} *` : c.header, fontWeight: "bold" as const, backgroundColor: c.required ? "#FDE68A" : "#E2E8F0", borderStyle: "thin" as const }));
    const example = COLS.map((c) => (c.example === "" ? null : { value: c.example, borderStyle: "thin" as const }));
    const help: Data = [
      [{ value: `${brand!.name} product import — how to fill`, fontWeight: "bold" as const }],
      [{ value: "One row per product. Columns marked * are required; all others are optional." }],
      [{ value: "SKU must be unique within the brand. A row whose SKU already exists updates that product (opening stock is then ignored)." }],
      [{ value: "GST %: 0, 5, 12, 18 or 28. Prices are numbers only (no ₹). Write Y in the 'incl GST' columns if that price already includes GST." }],
      [{ value: "Opening stock goes into the warehouse you name (or the brand's first warehouse)." }],
      [{ value: "Delete the example row before uploading." }],
    ];
    await writeXlsxFile([
      { data: [header, example] as Data, sheet: "Products", columns: COLS.map((c) => ({ width: Math.max(14, c.header.length + 4) })), stickyRowsCount: 1 },
      { data: help, sheet: "How to fill", columns: [{ width: 120 }] },
    ]).toFile(`${brand!.name}-product-import-template.xlsx`);
  }

  async function onFile(f: File | undefined) {
    setResult(null); setError(null); setRows(null); setFile(null);
    if (!f) return;
    try {
      let sheet: unknown[][];
      if (f.name.toLowerCase().endsWith(".csv")) sheet = parseCsv(await f.text());
      else {
        const { readSheet } = await import("read-excel-file/browser");
        sheet = (await readSheet(f)) as unknown[][];
      }
      // first non-empty row is the header
      const start = sheet.findIndex((r) => r.some((c) => c !== null && String(c).trim() !== ""));
      if (start < 0) return setError("The file is empty.");
      const headers = sheet[start].map((h) => String(h ?? "").replace(/\s*\*\s*$/, "").trim());
      const body = sheet.slice(start + 1).filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
      if (!body.length) return setError("No product rows under the header row.");
      setFile({ name: f.name, headers, body });
      setMapping(guessMapping(COLS, headers));
      const prep = await prepareProductImport(brand!.id);
      if (prep.error) return setError(prep.error);
      setCtx(prep.ctx!);
    } catch {
      setError("Could not read this file. Save it as .xlsx or .csv and try again.");
    }
  }

  function buildPreview() {
    if (!file) return;
    const missing = COLS.filter((c) => c.required && mapping[c.key] === undefined);
    if (missing.length) return setError(`Choose the file column for: ${missing.map((m) => m.header).join(", ")}.`);
    setError(null);
    setRows(file.body.map((r, i) => {
      const o: Row = { __row: String(i + 2) };
      for (const c of COLS) {
        const idx = mapping[c.key];
        const v = idx === undefined ? "" : r[idx];
        o[c.key] = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      }
      return o;
    }));
  }

  const edit = (i: number, key: string, v: string) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const remove = (i: number) => setRows((rs) => rs!.filter((_, j) => j !== i));

  function runImport() {
    if (!rows || !ctx) return;
    const valid = rows.filter((_, i) => !checks[i].errors.length);
    start(async () => {
      const res = await importProducts(brand!.id, valid);
      setResult(res);
      if (!res.fatal) { setRows(null); setFile(null); }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Importing into</span>
          <span className="w-64"><BrandSwitcher brands={brands} currentId={brand.id} canSeeAll={false} /></span>
          {canSeeAll && <span className="text-xs text-slate-400">(products always belong to one brand)</span>}
        </div>
        <ol className="mb-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-5">
          {["Download the template", "Fill it in Excel", "Upload the file", "Check & fix the preview", "Import valid rows"].map((s, i) => (
            <li key={s} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">{i + 1}</span>{s}</li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="secondary" onClick={downloadTemplate}><Download className="size-4" /> Download {brand.name} template</Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">
            <FileSpreadsheet className="size-4" /> Upload .xlsx or .csv
            <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} onClick={(e) => ((e.target as HTMLInputElement).value = "")} />
          </label>
          {file && <span className="text-sm text-slate-500">{file.name} · {file.body.length} rows</span>}
        </div>
        <p className="mt-3 text-xs text-slate-500">Nothing is saved until you press Import on the preview. Any column names work — you match them in the next step.</p>
      </Card>

      {error && <Alert>{error}</Alert>}

      {file && ctx && !rows && (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Match the columns</h2>
          <p className="mb-4 text-sm text-slate-500">We matched what we could. Check each field and pick &ldquo;Not in file&rdquo; for anything your sheet does not have.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLS.map((c) => (
              <label key={c.key} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{c.header}{c.required && <span className="text-red-600"> *</span>}</span>
                <select value={mapping[c.key] ?? ""} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[c.key]; else n[c.key] = Number(e.target.value); return n; })}
                  className={cn("h-10 w-full rounded-lg border bg-white px-2 text-sm", mapping[c.key] === undefined ? (c.required ? "border-red-300 bg-red-50" : "border-slate-200 text-slate-400") : "border-emerald-300 bg-emerald-50/50")}>
                  <option value="">— Not in file —</option>
                  {file.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <Button className="mt-5" onClick={buildPreview}>Show preview</Button>
        </Card>
      )}

      {rows && ctx && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="green"><CheckCircle2 className="mr-1 size-3.5" />{good} ready</Badge>
              {updates > 0 && <Badge tone="blue">{updates} will update existing</Badge>}
              {bad > 0 && <Badge tone="red"><XCircle className="mr-1 size-3.5" />{bad} with errors</Badge>}
              <label className="ml-2 flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="size-4" /> Show only rows with problems</label>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRows(null)}>Back to columns</Button>
              <Button onClick={runImport} disabled={pending || good === 0}>{pending ? "Importing…" : bad ? `Import ${good} valid rows (skip ${bad})` : `Import ${good} products`}</Button>
            </div>
          </div>
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">Click any cell to correct it — the checks update as you type. Rows with errors (red) are not imported.</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-white text-left text-slate-500 shadow-sm">
                <tr>
                  <th className="px-2 py-2 font-medium">Row</th>
                  {SHOW.map((k) => <th key={k} className="px-1 py-2 font-medium whitespace-nowrap">{COLS.find((c) => c.key === k)?.header}</th>)}
                  <th className="px-2 py-2 font-medium">Check</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const c = checks[i];
                  if (onlyProblems && !c.errors.length && !c.warnings.length) return null;
                  return (
                    <tr key={r.__row} className={cn(c.errors.length ? "bg-red-50/70" : c.warnings.length ? "bg-amber-50/40" : "")}>
                      <td className="px-2 py-1 font-mono text-slate-400">{r.__row}</td>
                      {SHOW.map((k) => (
                        <td key={k} className="px-0.5 py-0.5">
                          <input value={r[k] ?? ""} onChange={(e) => edit(i, k, e.target.value)} aria-label={`${k} row ${r.__row}`}
                            className={cn("h-7 w-full min-w-16 rounded border border-transparent bg-transparent px-1.5 hover:border-slate-300 focus:border-ink-900 focus:bg-white focus:outline-none",
                              k === "name" && "min-w-44", (k === "name" || k === "sku") && !r[k] && "border-red-300 bg-white")} />
                        </td>
                      ))}
                      <td className="max-w-72 px-2 py-1">
                        {c.errors.map((e) => <div key={e} className="flex items-start gap-1 text-red-700"><XCircle className="mt-0.5 size-3 shrink-0" />{e}</div>)}
                        {c.warnings.map((w) => <div key={w} className="flex items-start gap-1 text-amber-800"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{w}</div>)}
                        {!c.errors.length && !c.warnings.length && <span className="text-emerald-700">OK</span>}
                      </td>
                      <td className="px-1"><button onClick={() => remove(i)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600" aria-label={`Remove row ${r.__row}`}><Trash2 className="size-3.5" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-5">
          {result.fatal ? <Alert>{result.fatal}</Alert> : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="green">{result.created} created</Badge>
                {result.updated > 0 && <Badge tone="blue">{result.updated} updated</Badge>}
                {result.stockRows > 0 && <Badge tone="blue">{result.stockRows} opening stock entries</Badge>}
                {result.skipped > 0 && <Badge tone="red">{result.skipped} skipped</Badge>}
              </div>
              {result.errors.length > 0 && (
                <ul className="max-h-72 space-y-1 overflow-auto text-sm">
                  {result.errors.map((e, i) => <li key={i}><span className="font-mono text-slate-500">Row {e.row}:</span> {e.message}</li>)}
                </ul>
              )}
              <Link href="/products" className="mt-4 inline-block text-sm font-medium text-accent-700 hover:underline">Go to {brand.name} products</Link>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
