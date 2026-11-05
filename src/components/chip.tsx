import Link from "next/link";
import { cn } from "./ui";

// Filter chip that links to a URL with the filter applied.
export function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition",
        active ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
      )}
    >
      {children}
    </Link>
  );
}

// Link styled as a button.
export function LinkButton({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap",
        variant === "primary" ? "bg-ink-900 px-4 text-white hover:bg-ink-800" : "border border-slate-300 bg-white hover:bg-slate-50",
        className
      )}
    >
      {children}
    </Link>
  );
}
