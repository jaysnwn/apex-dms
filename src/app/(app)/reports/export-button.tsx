"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

type Col = { key: string; label: string; type?: string };

export function ExportButton({ title, columns, rows, totals }: { title: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, number> }) {
  async function run() {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    type Data = import("write-excel-file/browser").SheetData;
    const numeric = (t?: string) => t === "money" || t === "num" || t === "pct" || t === "int";
    const header = columns.map((c) => ({ value: c.label, fontWeight: "bold" as const }));
    const body = rows.map((r) =>
      columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined || v === "") return null;
        if (numeric(c.type)) return { value: Number(v), format: c.type === "money" ? "#,##0.00" : c.type === "pct" ? "0.0" : c.type === "int" ? "0" : "#,##0.###" };
        return { value: String(v) };
      })
    );
    const foot = totals
      ? [columns.map((c, i) => (i === 0 ? { value: "Total", fontWeight: "bold" as const } : totals[c.key] !== undefined ? { value: Number(totals[c.key]), fontWeight: "bold" as const, format: c.type === "money" ? "#,##0.00" : "#,##0.###" } : null))]
      : [];
    await writeXlsxFile([header, ...body, ...foot] as Data, {
      columns: columns.map((c) => ({ width: Math.max(12, c.label.length + 4) })),
      sheet: title.slice(0, 30),
    }).toFile(`${title.replace(/[^\w]+/g, "_")}.xlsx`);
  }
  function csv() {
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const t = String(v);
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [columns.map((c) => esc(c.label)).join(",")];
    for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(","));
    if (totals) lines.push(columns.map((c, i) => (i === 0 ? "Total" : totals[c.key] !== undefined ? esc(totals[c.key]) : "")).join(","));
    // BOM so Excel opens ₹ and Marathi/Hindi text correctly
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={run} disabled={rows.length === 0}>
        <Download className="size-4" /> Excel
      </Button>
      <Button variant="secondary" onClick={csv} disabled={rows.length === 0}>
        <Download className="size-4" /> CSV
      </Button>
    </div>
  );
}
