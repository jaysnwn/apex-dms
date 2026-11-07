"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setBrandLogo } from "../actions";

export function LogoUpload({ brandId, url, canEdit }: { brandId: string; url: string | null; canEdit: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError("Use a PNG or JPG logo.");
    if (file.size > 2 * 1024 * 1024) return setError("Logo must be under 2 MB.");
    setBusy(true); setError(null);
    const path = `brands/${brandId}/logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const { error: up } = await createClient().storage.from("product-images").upload(path, file, { contentType: file.type });
    if (up) { setBusy(false); return setError(up.message); }
    const r = await setBrandLogo(brandId, path);
    setBusy(false);
    if (r.error) return setError(r.error);
    start(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      <span className="grid h-14 w-28 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="Logo" className="max-h-12 max-w-24 object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
      </span>
      {canEdit && (
        <span className="flex flex-col gap-1">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-700 hover:underline disabled:opacity-60">
            <ImagePlus className="size-4" /> {busy ? "Uploading…" : url ? "Change logo" : "Upload logo"}
          </button>
          {url && (
            <button type="button" onClick={() => start(async () => { await setBrandLogo(brandId, null); router.refresh(); })} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600">
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </span>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}
