import Link from "next/link";
import { Check } from "lucide-react";
import { cn, pressable } from "./ui";

// Filter chip that links to a URL with the filter applied. Chosen = soft blue with a tick.
export function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap",
        pressable,
        active ? "border-transparent bg-primary-soft text-primary-text" : "border-line bg-surface text-text-2 hover:border-field/60 hover:text-text"
      )}
    >
      {active && <Check className="-ml-0.5 size-3.5" strokeWidth={2.5} aria-hidden />}
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
        "inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-3.5 text-sm font-medium whitespace-nowrap",
        pressable,
        variant === "primary"
          ? "bg-primary px-4 text-on-fill shadow-[var(--shadow-card)] hover:bg-primary-hover"
          : "border border-line bg-surface text-text shadow-[var(--shadow-card)] hover:border-field/60 hover:bg-sunken",
        className
      )}
    >
      {children}
    </Link>
  );
}
