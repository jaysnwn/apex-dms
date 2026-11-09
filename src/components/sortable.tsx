"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { cn } from "./ui";

// A list the user can reorder by dragging (mouse) or with the ↑ ↓ buttons (touch, keyboard).
// onReorder receives the new key order; the caller saves it.
export function SortableList<T>({ items, keyOf, render, onReorder, disabled, className }: {
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  onReorder: (keys: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const keys = items.map(keyOf);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= keys.length || from === to) return;
    const next = [...keys];
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    onReorder(next);
  };
  return (
    <ul className={cn("divide-y divide-slate-100", className)}>
      {items.map((it, i) => (
        <li key={keys[i]}
          draggable={!disabled}
          onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", keys[i]); }}
          onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver(i); } }}
          onDragLeave={() => setOver((o) => (o === i ? null : o))}
          onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setOver(null); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          className={cn("flex items-center gap-2 bg-white", drag === i && "opacity-40", over === i && drag !== null && drag !== i && "ring-2 ring-accent-400 ring-inset")}>
          {!disabled && <GripVertical className="ml-1 size-4 shrink-0 cursor-grab text-slate-300" aria-hidden />}
          <div className="min-w-0 flex-1">{render(it, i)}</div>
          {!disabled && (
            <div className="flex shrink-0 flex-col pr-1">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20" aria-label="Move up"><ChevronUp className="size-4" /></button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20" aria-label="Move down"><ChevronDown className="size-4" /></button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
