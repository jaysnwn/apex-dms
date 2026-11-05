"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { qty } from "@/lib/format";
import { reviewCount, saveCountLines } from "../../actions";

export type SheetLine = {
  id: string;
  product: string;
  sku: string;
  rack: string | null;
  system_qty: number;
  counted_qty: number | null;
};

export function CountSheet({
  countId,
  status,
  lines,
  showSystem,
  canApprove,
}: {
  countId: string;
  status: "draft" | "submitted" | "approved" | "cancelled";
  lines: SheetLine[];
  showSystem: boolean;
  canApprove: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, l.counted_qty === null ? "" : String(l.counted_qty)]))
  );
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const editable = status === "draft";

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? lines.filter((l) => `${l.product} ${l.sku} ${l.rack ?? ""}`.toLowerCase().includes(f)) : lines;
  }, [lines, filter]);

  const counted = Object.values(values).filter((v) => v.trim() !== "").length;
  const variances = lines.filter((l) => values[l.id]?.trim() !== "" && Number(values[l.id]) !== Number(l.system_qty));

  function run(fn: () => Promise<{ ok?: string; error?: string }>) {
    start(async () => {
      const res = await fn();
      setMsg(res);
      if (!res.error) router.refresh();
    });
  }

  // Send only lines that changed since the page loaded.
  const payload = () =>
    lines
      .filter((l) => (values[l.id] ?? "") !== (l.counted_qty === null ? "" : String(l.counted_qty)))
      .map((l) => ({ id: l.id, counted: values[l.id] ?? "" }));

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Filter by product, model or rack…" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:max-w-xs" />
        <div className="text-sm text-slate-500">
          <span className="tabular font-medium text-slate-900">{counted}</span> of {lines.length} counted
          {showSystem && <> · <span className="tabular font-medium text-slate-900">{variances.length}</span> with a difference</>}
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Rack</th>
              <th className="px-3 py-2.5">Product</th>
              {showSystem && <th className="px-3 py-2.5 text-right">System</th>}
              <th className="px-3 py-2.5 text-right">Counted</th>
              {showSystem && <th className="px-4 py-2.5 text-right">Difference</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((l) => {
              const v = values[l.id] ?? "";
              const diff = v.trim() === "" ? null : Number(v) - Number(l.system_qty);
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{l.rack ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.product}</div>
                    <div className="font-mono text-xs text-slate-500">{l.sku}</div>
                  </td>
                  {showSystem && <td className="tabular px-3 py-2 text-right text-slate-500">{qty(l.system_qty)}</td>}
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={v}
                        onChange={(e) => setValues((s) => ({ ...s, [l.id]: e.target.value }))}
                        className="tabular ml-auto h-9 w-24 text-right"
                        aria-label={`Counted ${l.product}`}
                      />
                    ) : (
                      <span className="tabular">{v === "" ? "—" : qty(v)}</span>
                    )}
                  </td>
                  {showSystem && (
                    <td className={cn("tabular px-4 py-2 text-right font-medium", diff === null || diff === 0 ? "text-slate-400" : diff < 0 ? "text-red-700" : "text-emerald-700")}>
                      {diff === null ? "—" : diff > 0 ? `+${qty(diff)}` : qty(diff)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {editable && (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => saveCountLines(countId, payload(), false))}>Save progress</Button>
            <Button
              disabled={pending || counted === 0}
              onClick={() => {
                if (confirm(`Submit this count? ${lines.length - counted} uncounted product(s) will be left unchanged.`))
                  run(() => saveCountLines(countId, payload(), true));
              }}
            >
              Submit for approval
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => confirm("Cancel this count?") && run(() => reviewCount(countId, "cancel"))}>Cancel count</Button>
          </>
        )}
        {status === "submitted" && canApprove && (
          <>
            <Button disabled={pending} onClick={() => confirm("Approve and post the differences to stock?") && run(() => reviewCount(countId, "approve"))}>
              Approve and post differences
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => reviewCount(countId, "reopen"))}>Send back for recount</Button>
          </>
        )}
        {status === "submitted" && !canApprove && <p className="text-sm text-slate-500">Waiting for a Manager to approve.</p>}
        {msg.error && <Alert>{msg.error}</Alert>}
        {msg.ok && <Alert tone="green">{msg.ok}</Alert>}
      </div>
      {showSystem && status === "submitted" && (
        <p className="mt-3 text-xs text-slate-500">
          System quantities are from when the count started. On approval, differences are worked out against stock at that moment, so sales or entries made during the count are not lost.
        </p>
      )}
    </>
  );
}
