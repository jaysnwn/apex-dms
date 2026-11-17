"use client";

import * as m from "motion/react-m";
import { Monitor, Moon, Rows3, Rows4, Sun, Zap, ZapOff } from "lucide-react";
import { usePrefs } from "./prefs-provider";
import { cn } from "./ui";
import { spring } from "@/lib/motion";

type Opt<T extends string> = { value: T; label: string; icon: React.ComponentType<{ className?: string }> };

// Theme, density and motion. Saved on this device; take effect at once.
export function DisplaySettings() {
  const p = usePrefs();
  return (
    <div className="grid gap-5">
      <Setting title="Theme" hint="Light is easiest on the eyes in a bright shop; dark suits evenings.">
        <Segmented
          id="theme"
          value={p.theme}
          onChange={p.setTheme}
          options={[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "Same as device", icon: Monitor },
          ]}
        />
      </Setting>
      <Setting title="Table density" hint="Compact fits more rows on the screen.">
        <Segmented
          id="density"
          value={p.density}
          onChange={p.setDensity}
          options={[
            { value: "comfortable", label: "Comfortable", icon: Rows3 },
            { value: "compact", label: "Compact", icon: Rows4 },
          ]}
        />
      </Setting>
      <Setting title="Motion" hint="Reduce motion turns animations into quick fades. Your device setting is respected too.">
        <Segmented
          id="motion"
          value={p.motion}
          onChange={p.setMotion}
          options={[
            { value: "full", label: "Full", icon: Zap },
            { value: "reduce", label: "Reduce motion", icon: ZapOff },
          ]}
        />
      </Setting>
    </div>
  );
}

function Setting({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-text">{title}</div>
        <p className="text-[13px] text-text-2">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ id, value, onChange, options }: { id: string; value: T; onChange: (v: T) => void; options: Opt<T>[] }) {
  return (
    <div role="radiogroup" aria-label={id} className="inline-flex shrink-0 rounded-full bg-sunken p-1">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn("relative flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors", on ? "text-text" : "text-text-2 hover:text-text")}
          >
            {on && <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-raised shadow-[var(--shadow-card)]" transition={spring.snappy} />}
            <Icon className="relative size-4" />
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
