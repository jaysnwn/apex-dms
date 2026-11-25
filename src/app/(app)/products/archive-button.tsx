"use client";

import { toast } from "sonner";
import { askConfirm } from "@/components/confirm";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { setProductArchived } from "./actions";

export function ArchiveButton({ id, archived, name }: { id: string; archived: boolean; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} title={archived ? "Bring back" : "Archive (discontinued)"}
      aria-label={archived ? `Bring back ${name}` : `Archive ${name}`}
      onClick={async () => {
        if (!archived && !(await askConfirm(`Archive ${name}? It will be hidden from orders but stays in history.`, { confirmLabel: "Archive" }))) return;
        start(async () => { const r = await setProductArchived(id, !archived); if (r.error) toast.error(r.error); router.refresh(); });
      }}
      className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">
      {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
    </button>
  );
}
