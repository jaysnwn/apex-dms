"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { BarcodeScanButton } from "./barcode-scanner";
import { Button, Input } from "./ui";

// Search box that writes ?q= to the URL; optional barcode scanner.
export function SearchBar({ placeholder, scan = false }: { placeholder: string; scan?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function go(q: string) {
    const next = new URLSearchParams(params.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    router.push(`${pathname}?${next}`);
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go(value.trim());
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="pl-9" type="search" />
      </div>
      <Button type="submit" variant="secondary">Search</Button>
      {scan && (
        <BarcodeScanButton
          onDetected={(code) => {
            setValue(code);
            go(code);
          }}
        />
      )}
    </form>
  );
}
