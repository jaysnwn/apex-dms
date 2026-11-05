"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, cn } from "@/components/ui";
import { addProductImage, removeProductImage, setPrimaryImage } from "../actions";

type Photo = { id: string; url: string | undefined; is_primary: boolean };

// Shrinks a photo to max 1200 px JPEG before upload (phone photos are 3–8 MB).
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.85)
  );
}

export function PhotoManager({ productId, photos, canEdit }: { productId: string; photos: Photo[]; canEdit: boolean }) {
  const [selected, setSelected] = useState<string | undefined>(photos.find((p) => p.is_primary)?.id ?? photos[0]?.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const current = photos.find((p) => p.id === selected) ?? photos[0];

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
        const blob = await shrink(file);
        const path = `${productId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw new Error(upErr.message);
        const res = await addProductImage(productId, path);
        if (res.error) throw new Error(res.error);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white">
        {current?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt="" className="h-full w-full object-contain p-4" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-400">No photo yet</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={cn("relative size-16 overflow-hidden rounded-lg border bg-white", p.id === current?.id ? "border-accent-500 ring-2 ring-accent-500/30" : "border-slate-200")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.url && <img src={p.url} alt="" className="h-full w-full object-contain p-1" />}
            {p.is_primary && <Star className="absolute top-1 right-1 size-3 fill-accent-500 text-accent-500" />}
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="grid size-16 place-items-center rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 disabled:opacity-50"
            aria-label="Add photos"
          >
            <ImagePlus className="size-5" />
          </button>
        )}
      </div>

      {canEdit && (
        <>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          {busy && <p className="mt-2 text-sm text-slate-500">Uploading…</p>}
          {error && <div className="mt-2"><Alert>{error}</Alert></div>}
          {current && (
            <div className="mt-3 flex gap-2">
              {!current.is_primary && (
                <Button size="sm" variant="secondary" onClick={async () => { await setPrimaryImage(productId, current.id); router.refresh(); }}>
                  <Star className="size-4" /> Make main photo
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Remove this photo?")) return;
                  await removeProductImage(productId, current.id);
                  setSelected(undefined);
                  router.refresh();
                }}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
