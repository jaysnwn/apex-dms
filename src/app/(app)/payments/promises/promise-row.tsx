"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { setPromiseStatus } from "../actions";

export function PromiseButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (s: "kept" | "broken") => start(async () => { await setPromiseStatus(id, s); router.refresh(); });
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="secondary" className="text-emerald-700" disabled={pending} onClick={() => set("kept")}>Kept</Button>
      <Button size="sm" variant="secondary" className="text-red-700" disabled={pending} onClick={() => set("broken")}>Broken</Button>
    </div>
  );
}
