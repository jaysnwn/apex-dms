"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Alert, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORY } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { submitExpense } from "./actions";

export function ExpenseForm({ userId, routes }: { userId: string; routes: { id: string; name: string }[] }) {
  const [category, setCategory] = useState("fuel");
  const [amount, setAmount] = useState("");
  const [dateV, setDate] = useState(todayIST());
  const [description, setDescription] = useState("");
  const [route, setRoute] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const uuid = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : undefined);
  const router = useRouter();

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Add an expense</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Category</Label><Select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div><Label>Amount (₹)</Label><Input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Date</Label><Input type="date" value={dateV} max={todayIST()} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label hint="optional">Route</Label><Select value={route} onChange={(e) => setRoute(e.target.value)}><option value="">—</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Petrol, Sangamner–Akole route" /></div>
        <div className="sm:col-span-2">
          <Label hint="photo of the bill">Receipt</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600 hover:border-slate-400">
            <Camera className="size-4" /> {file ? file.name : "Take or choose a photo"}
            <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={() => start(async () => {
          setMsg({});
          let path: string | null = null;
          if (file) {
            path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.]+/g, "_")}`;
            const { error } = await createClient().storage.from("expense-receipts").upload(path, file);
            if (error) { setMsg({ error: `Receipt upload failed: ${error.message}` }); return; }
          }
          const res = await submitExpense({ category, amount: Number(amount), date: dateV, description, routeId: route || null, receiptPath: path, clientUuid: uuid.current });
          if (res.error) setMsg({ error: res.error });
          else {
            setMsg({ ok: "Submitted for approval." });
            setAmount(""); setDescription(""); setFile(null); uuid.current = crypto.randomUUID();
            router.refresh();
          }
        })}>{pending ? "Submitting…" : "Submit expense"}</Button>
        {msg.error && <Alert>{msg.error}</Alert>}
        {msg.ok && <Alert tone="green">{msg.ok}</Alert>}
      </div>
    </Card>
  );
}
