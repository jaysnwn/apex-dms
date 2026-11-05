"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { runClassification } from "../actions";

export function ClassifyButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await runClassification(); router.refresh(); })}>
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} /> <span className="hidden sm:inline">Re-classify</span>
    </Button>
  );
}
