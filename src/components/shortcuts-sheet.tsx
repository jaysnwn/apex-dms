"use client";

import { Dialog } from "./dialog";
import { Kbd } from "./ui";
import { GO_KEYS, type NavGroup, type QuickAction } from "./nav-config";

// The "?" sheet: every keyboard shortcut in one place.
export function ShortcutsSheet({ onClose, actions, groups }: { onClose: () => void; actions: QuickAction[]; groups: NavGroup[] }) {
  const navKeys = new Set(groups.flatMap((g) => g.items.map((i) => i.key)));
  const go = GO_KEYS.filter((g) => navKeys.has(g.nav));
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Anywhere">
          <Row keys={["Ctrl", "K"]} label="Search and jump to anything" />
          <Row keys={["/"]} label="Search" />
          <Row keys={["?"]} label="This list" />
          {actions.filter((a) => a.shortcut).map((a) => <Row key={a.key} keys={[a.shortcut!]} label={a.label} />)}
        </Section>
        <Section title="Go to (press G, then the letter)">
          {go.map((g) => <Row key={g.key} keys={["G", g.key.toUpperCase()]} label={g.label} />)}
        </Section>
        <Section title="Billing screen">
          <Row keys={["F4"]} label="Choose retailer" />
          <Row keys={["/"]} label="Search products" />
          <Row keys={["F2"]} label="Product catalogue" />
          <Row keys={["Ctrl", "↵"]} label="Review and generate invoice" />
        </Section>
        <Section title="Lists and dialogs">
          <Row keys={["Esc"]} label="Close a dialog or the search" />
          <Row keys={["↑", "↓"]} label="Move through search results" />
          <Row keys={["↵"]} label="Open the highlighted result" />
        </Section>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-text-2">{title}</h3>
      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line">{children}</ul>
    </section>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-3 py-2 text-sm text-text">
      <span>{label}</span>
      <span className="flex shrink-0 gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
    </li>
  );
}
