import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { CircleCheck, CircleDot, CircleMinus, Clock, FilePen, Info, TriangleAlert, Truck, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Later classes win over earlier ones (e.g. "w-full" + "w-36" -> "w-36").
export function cn(...args: Parameters<typeof clsx>) {
  return twMerge(clsx(...args));
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
};

// Press feedback: a quick scale to 0.97 that springs back (CSS, so it costs nothing to hydrate).
export const pressable =
  "transition-[transform,background-color,border-color,color,box-shadow] duration-[110ms] ease-[cubic-bezier(.34,1.56,.64,1)] active:scale-[.97] motion-reduce:active:scale-100 motion-reduce:transition-colors";

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium",
        pressable,
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-primary text-on-fill shadow-[var(--shadow-card)] hover:bg-primary-hover",
        variant === "secondary" && "border border-line bg-surface text-text shadow-[var(--shadow-card)] hover:border-field/60 hover:bg-sunken",
        variant === "danger" && "bg-red-600 text-on-fill hover:bg-red-700",
        variant === "ghost" && "text-text-2 hover:bg-sunken hover:text-text",
        className
      )}
      {...props}
    />
  );
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-text">
      {children}
      {hint && <span className="ml-1 font-normal text-text-2">{hint}</span>}
    </label>
  );
}

// Fields: a 3:1 outline so they can be found at a glance, and a focus ring that eases in.
const fieldClass =
  "block w-full rounded-[var(--radius-control)] border border-field/55 bg-raised px-3 text-sm text-text placeholder:text-text-3 " +
  "transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-field " +
  "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 " +
  "aria-[invalid=true]:border-red-600 aria-[invalid=true]:focus:ring-red-600/15 disabled:bg-sunken disabled:text-text-2";

// React 19: `ref` is passed like any other prop.
export function Input({ className, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(fieldClass, "h-10", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, "h-10 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "py-2", className)} {...props} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-text sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Status chips: colour + icon + word, so meaning never rests on colour alone.
//   green = done / paid       amber = waiting / due      red = overdue / short / blocked
//   blue  = issued / active   violet = draft / quotation teal = dispatched / on the way
//   slate = cancelled / inactive
const badgeTones = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-800",
  red: "bg-red-50 text-red-800",
  amber: "bg-amber-50 text-amber-800",
  orange: "bg-amber-50 text-amber-800",
  blue: "bg-blue-50 text-blue-800",
  violet: "bg-violet-50 text-violet-800",
  teal: "bg-teal-50 text-teal-800",
};
const badgeIconColor: Record<keyof typeof badgeTones, string> = {
  slate: "text-slate-500",
  green: "text-emerald-600",
  red: "text-red-600",
  amber: "text-amber-600",
  orange: "text-amber-600",
  blue: "text-blue-600",
  violet: "text-violet-600",
  teal: "text-teal-600",
};
const badgeIcons: Record<keyof typeof badgeTones, LucideIcon> = {
  slate: CircleMinus,
  green: CircleCheck,
  red: TriangleAlert,
  amber: Clock,
  orange: Clock,
  blue: CircleDot,
  violet: FilePen,
  teal: Truck,
};
export type Tone = keyof typeof badgeTones;

export function Badge({ children, tone = "slate", icon = true }: { children: ReactNode; tone?: Tone; icon?: boolean }) {
  const Icon = badgeIcons[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full pr-2.5 text-xs font-medium transition-colors duration-[160ms]",
        icon ? "pl-2" : "pl-2.5",
        badgeTones[tone]
      )}
    >
      {icon && <Icon className={cn("size-3.5 shrink-0", badgeIconColor[tone])} strokeWidth={2.25} aria-hidden />}
      {children}
    </span>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "amber" | "blue"; children: ReactNode }) {
  const Icon = tone === "green" ? CircleCheck : tone === "blue" ? Info : TriangleAlert;
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm",
        tone === "red" && "border-red-200 bg-red-50 text-red-900",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "blue" && "border-blue-200 bg-blue-50 text-blue-900"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "red" && "text-red-600",
          tone === "green" && "text-emerald-600",
          tone === "amber" && "text-amber-600",
          tone === "blue" && "text-blue-600"
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Short label for keyboard shortcuts, e.g. <Kbd>Ctrl K</Kbd>.
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-sunken px-1.5 font-mono text-xs font-medium text-text-2",
        className
      )}
    >
      {children}
    </kbd>
  );
}
