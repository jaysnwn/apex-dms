"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { createClient, tenantStoragePath } from "@/lib/supabase/client";
import { setCompanyLogo } from "./actions";

// The business's logo: in the app's menu, on the salesman app, on the
// business's sign-in page and at the top of every invoice, receipt and slip.
export function CompanyLogoUpload({ url }: { url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [, start] = useTransition();

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setMsg({ error: "Use a PNG (best, with a transparent background) or a JPG." });
    if (file.size > 2 * 1024 * 1024) return setMsg({ error: "The logo must be under 2 MB." });
    setBusy(true); setMsg({});
    const path = tenantStoragePath(`logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`);
    const { error: up } = await createClient().storage.from("branding").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (up) { setBusy(false); return setMsg({ error: up.message }); }
    const r = await setCompanyLogo(path);
    setBusy(false);
    setMsg(r);
    if (r.ok) start(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <span className="grid h-20 w-full max-w-72 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="Company logo" className="max-h-14 max-w-full object-contain" /> : <span className="text-sm text-slate-400">No logo yet</span>}
      </span>
      <span className="flex flex-col gap-1.5">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-700 hover:underline disabled:opacity-60">
          <ImagePlus className="size-4" /> {busy ? "Uploading…" : url ? "Change logo" : "Upload logo"}
        </button>
        {url && (
          <button type="button" disabled={busy} onClick={() => start(async () => { setMsg(await setCompanyLogo(null)); router.refresh(); })} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600">
            <Trash2 className="size-3.5" /> Remove logo
          </button>
        )}
        <span className="text-xs text-slate-500">PNG with a transparent background works best. Wide logos fit best; at most 2 MB.</span>
        {msg.error && <span className="text-xs text-red-600">{msg.error}</span>}
        {msg.ok && <span className="text-xs text-emerald-700">{msg.ok}</span>}
      </span>
      <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
