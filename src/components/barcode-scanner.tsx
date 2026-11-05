"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui";

// Camera barcode scanner (works on Android Chrome and iPhone Safari).
// Calls onDetected once with the scanned text, then closes.
export function BarcodeScanButton({ onDetected, label = "Scan" }: { onDetected: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-label="Scan barcode">
        <ScanLine className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {open && (
        <ScannerDialog
          onClose={() => setOpen(false)}
          onDetected={(code) => {
            setOpen(false);
            onDetected(code);
          }}
        />
      )}
    </>
  );
}

function ScannerDialog({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onDetected);
  useEffect(() => {
    callback.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let done = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (result && !done) {
              done = true;
              controls.stop();
              callback.current(result.getText());
            }
          }
        );
        stop = () => controls.stop();
      } catch {
        setError("Camera not available. Allow camera access, or type the barcode instead.");
      }
    })();
    return () => stop?.();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Scan barcode">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium">Point the camera at the barcode</span>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        {error ? (
          <p className="p-6 text-sm text-red-700">{error}</p>
        ) : (
          <video ref={videoRef} className="aspect-[4/3] w-full bg-black object-cover" muted playsInline />
        )}
      </div>
    </div>
  );
}
