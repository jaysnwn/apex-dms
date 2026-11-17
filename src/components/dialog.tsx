"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as m from "motion/react-m";
import { useDragControls, type PanInfo } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "./ui";
import { duration, ease, spring } from "@/lib/motion";

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setPhone(mq.matches);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

// Bottom sheet on phones (drag the handle down to close), centred dialog on desktop.
// Radix keeps focus inside, closes on Escape and gives focus back to the opener.
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const phone = useIsPhone();
  const drag = useDragControls();

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  }

  return (
    <RD.Root open onOpenChange={(open) => !open && onClose()}>
      <RD.Portal>
        <RD.Overlay asChild>
          <m.div
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: duration.fast, ease: ease.out }}
          />
        </RD.Overlay>
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <RD.Content asChild aria-describedby={undefined}>
            <m.div
              className={cn(
                "pointer-events-auto relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-raised shadow-[var(--shadow-raised)] outline-none",
                "rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)]",
                wide ? "sm:max-w-5xl" : "sm:max-w-lg"
              )}
              initial={phone ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 6 }}
              animate={phone ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
              transition={phone ? spring.gentle : { duration: duration.base, ease: ease.out }}
              drag={phone ? "y" : false}
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={onDragEnd}
            >
              {phone && (
                <div
                  className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                  onPointerDown={(e) => drag.start(e)}
                  aria-hidden
                >
                  <span className="h-1 w-10 rounded-full bg-slate-300" />
                </div>
              )}
              <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-3 pb-3 sm:pt-5">
                <RD.Title className="text-[17px] font-semibold tracking-[-0.01em] text-text">{title}</RD.Title>
                <RD.Close
                  className="grid size-9 place-items-center rounded-full text-text-2 transition-colors hover:bg-sunken hover:text-text"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </RD.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            </m.div>
          </RD.Content>
        </div>
      </RD.Portal>
    </RD.Root>
  );
}
