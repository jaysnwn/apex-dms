"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, IndianRupee } from "lucide-react";
import { cn } from "@/components/ui";
import { inr } from "@/lib/format";
import { recordPayment } from "../../../(app)/payments/actions";
import { Sheet } from "../../ui";

type Method = "cash" | "upi" | "bank_transfer" | "cheque";
const METHODS: { k: Method; label: string }[] = [{ k: "cash", label: "Cash" }, { k: "upi", label: "UPI" }, { k: "cheque", label: "Cheque" }, { k: "bank_transfer", label: "Bank" }];

export function CollectButton({ retailerId, shop, outstanding, overdue }: { retailerId: string; shop: string; outstanding: number; overdue: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [bank, setBank] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const uuid = useRef(crypto.randomUUID());

  async function save() {
    setError(null);
    const amt = Number(amount);
    if (!(amt > 0)) return setError("Enter the amount received.");
    if (method !== "cash" && !reference.trim()) return setError(method === "cheque" ? "Enter the cheque number." : "Enter the reference / UTR number.");
    if (!navigator.onLine) return setError("No internet. Use Today's route to save payments offline, or try again when online.");
    setBusy(true);
    const res = await recordPayment({ retailerId, amount: amt, method, reference, bank, clientUuid: uuid.current });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSaved(amt);
    uuid.current = crypto.randomUUID();
    router.refresh();
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setSaved(null); setAmount(overdue > 0 ? String(Math.round(overdue)) : ""); }}
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30 active:scale-[0.98]">
        <IndianRupee className="size-5" /> Collect
      </button>
      {open && (
        <Sheet title={saved ? "Payment saved" : `Collect from ${shop}`} onClose={() => setOpen(false)}
          footer={saved ? (
            <button onClick={() => setOpen(false)} className="h-12 w-full rounded-2xl bg-ink-900 font-semibold text-white">Done</button>
          ) : (
            <>
              {error && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
              <button disabled={busy} onClick={save} className="h-14 w-full rounded-2xl bg-emerald-600 text-lg font-bold text-white disabled:opacity-60">
                {busy ? "Saving…" : `Save ${Number(amount) > 0 ? inr(Number(amount), { decimals: false }) : "payment"}`}
              </button>
            </>
          )}>
          {saved ? (
            <div className="py-6 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white"><Check className="size-9" strokeWidth={3} /></span>
              <p className="mt-3 text-lg font-semibold">{inr(saved, { decimals: false })} received</p>
              <p className="text-sm text-slate-500">Applied to the oldest bills first.</p>
              <p className="mx-auto mt-3 max-w-xs rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {method === "cash" ? "Hand over the cash to the office." : method === "cheque" ? "Hand over the cheque to the office." : "Office will check it in the bank."} It counts for your incentive once the office verifies it.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Outstanding {inr(outstanding, { decimals: false })}{overdue > 0 && <> · <span className="font-semibold text-red-700">overdue {inr(overdue, { decimals: false })}</span></>}</p>
              <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ Amount" className="tabular h-16 w-full rounded-2xl border border-slate-300 px-4 text-center text-3xl font-bold outline-none focus:border-emerald-500" autoFocus />
              {outstanding > 0 && (
                <div className="flex gap-2">
                  {overdue > 0 && <button onClick={() => setAmount(String(Math.round(overdue)))} className="h-9 flex-1 rounded-xl bg-red-50 text-xs font-semibold text-red-700">Overdue {inr(overdue, { decimals: false })}</button>}
                  <button onClick={() => setAmount(String(Math.round(outstanding)))} className="h-9 flex-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">Full {inr(outstanding, { decimals: false })}</button>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {METHODS.map((m) => (
                  <button key={m.k} onClick={() => setMethod(m.k)} className={cn("h-11 rounded-xl text-sm font-semibold", method === m.k ? "bg-emerald-600 text-white" : "bg-white ring-1 ring-slate-300")}>{m.label}</button>
                ))}
              </div>
              {method !== "cash" && <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "cheque" ? "Cheque number" : "UPI / UTR reference"} className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base" />}
              {method === "cheque" && <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Bank name" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-base" />}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
