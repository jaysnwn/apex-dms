"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { COLUMNS, parseCsv, rowsToRecords, type ImportKind } from "@/lib/import-columns";
import { Alert, Badge, Button, Card, cn } from "@/components/ui";
import { importRetailers, type ImportResult } from "./actions";
import { ProductImporter } from "./product-importer";

const INFO: Record<ImportKind, { title: string; help: string }> = {
  products: {
    title: "Products and opening stock",
    help: "One row per product. Existing products (same Model / SKU) are updated. Opening stock is recorded only for new products. Missing brands and categories are created.",
  },
  retailers: {
    title: "Retailers",
    help: "One row per shop. Rows with a mobile number or GSTIN that already exists are skipped. Missing routes are created; salesmen are matched by login email.",
  },
};

type Brand = { id: string; name: string; code: string };

export function Importer({ initialTab, brand, brands, canSeeAll }: { initialTab: ImportKind; brand: Brand | null; brands: Brand[]; canSeeAll: boolean }) {
  const [tab, setTab] = useState<ImportKind>(initialTab);
  const [records, setRecords] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const columns = COLUMNS[tab];

  function switchTab(t: ImportKind) {
    setTab(t);
    setRecords(null);
    setResult(null);
    setError(null);
    setFileName("");
  }

  async function downloadTemplate() {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    type Data = import("write-excel-file/browser").SheetData;
    const header = columns.map((c) => ({ value: c.required ? `${c.header} *` : c.header, fontWeight: "bold" as const }));
    const example = columns.map((c) => (c.example === "" ? null : { value: c.example }));
    await writeXlsxFile([header, example] as Data, {
      columns: columns.map((c) => ({ width: Math.max(14, c.header.length + 4) })),
      sheet: tab === "products" ? "Products" : "Retailers",
    }).toFile(`apex-${tab}-template.xlsx`);
  }

  async function onFile(file: File | undefined) {
    setResult(null);
    setError(null);
    setRecords(null);
    if (!file) return;
    setFileName(file.name);
    try {
      let sheet: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        sheet = parseCsv(await file.text());
      } else {
        const { readSheet } = await import("read-excel-file/browser");
        sheet = (await readSheet(file)) as unknown[][];
      }
      // Template headers carry " *" for required columns.
      if (sheet[0]) sheet[0] = sheet[0].map((h) => String(h ?? "").replace(/\s*\*\s*$/, ""));
      const { records: recs, missing } = rowsToRecords(tab, sheet);
      if (missing.length) {
        setError(`Missing required column(s): ${missing.join(", ")}. Download the template to see the expected headers.`);
        return;
      }
      if (recs.length === 0) {
        setError("No data rows found under the header row.");
        return;
      }
      setRecords(recs);
    } catch {
      setError("Could not read this file. Save it as .xlsx or .csv and try again.");
    }
  }

  function runImport() {
    if (!records) return;
    start(async () => {
      const res = await importRetailers(records);
      setResult(res);
      if (!res.fatal) setRecords(null);
    });
  }

  const preview = records?.slice(0, 8) ?? [];
  const previewCols = columns.filter((c) => records?.some((r) => r[c.key]));

  return (
    <>
      <div className="mb-4 flex gap-2">
        {(Object.keys(INFO) as ImportKind[]).map((k) => (
          <button
            key={k}
            onClick={() => switchTab(k)}
            className={cn("rounded-full border px-3 py-1 text-sm", k === tab ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white hover:border-slate-400")}
          >
            {INFO[k].title}
          </button>
        ))}
      </div>

      {tab === "products" ? <ProductImporter brand={brand} brands={brands} canSeeAll={canSeeAll} /> : (<>
      <Card className="mb-6 p-5">
        <p className="mb-4 text-sm text-slate-600">{INFO[tab].help}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="size-4" /> Download template
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">
            <FileSpreadsheet className="size-4" /> Choose .xlsx or .csv file
            <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} onClick={(e) => ((e.target as HTMLInputElement).value = "")} />
          </label>
          {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Columns marked * are required: {columns.filter((c) => c.required).map((c) => c.header).join(", ")}.
        </p>
      </Card>

      {error && <div className="mb-6"><Alert>{error}</Alert></div>}

      {records && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">{records.length} row{records.length === 1 ? "" : "s"} ready</div>
              <div className="text-sm text-slate-500">Preview of the first {preview.length}. Each row is checked again on import.</div>
            </div>
            <Button onClick={runImport} disabled={pending}>{pending ? "Importing…" : `Import ${records.length} rows`}</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>{previewCols.map((c) => <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((r, i) => (
                  <tr key={i}>{previewCols.map((c) => <td key={c.key} className="px-3 py-2 whitespace-nowrap">{r[c.key]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-5">
          {result.fatal ? (
            <Alert>{result.fatal}</Alert>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="green">{result.created} created</Badge>
                {result.updated > 0 && <Badge tone="blue">{result.updated} updated</Badge>}
                {result.stockRows > 0 && <Badge tone="blue">{result.stockRows} opening stock entries</Badge>}
                {result.skipped > 0 && <Badge tone="red">{result.skipped} skipped</Badge>}
              </div>
              {result.errors.length > 0 && (
                <ul className="max-h-72 space-y-1 overflow-auto text-sm">
                  {result.errors.map((e, i) => (
                    <li key={i}><span className="font-mono text-slate-500">Row {e.row}:</span> {e.message}</li>
                  ))}
                </ul>
              )}
              <Link href="/retailers" className="mt-4 inline-block text-sm font-medium text-accent-700 hover:underline">
                Go to retailers
              </Link>
            </>
          )}
        </Card>
      )}
      </>)}
    </>
  );
}
