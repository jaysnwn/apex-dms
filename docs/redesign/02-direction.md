# APEX DMS redesign — 02 · Design direction

**Direction: "Quiet ledger".** A calm, near-monochrome work surface where the only colour you see either *means
something* (a status) or *is APEX* (one saffron accent). Numbers are the heroes. Motion explains what changed and then
gets out of the way. Built for eight hours a day on a desktop, and for one hand on a phone in a shop.

One direction, three borrowed principles:

| From | We take | We leave |
| --- | --- | --- |
| **Apple** | Content first, chrome recedes (the sidebar becomes a quiet surface, not a dark slab). Generous spacing. Soft depth: hairline borders, barely-there shadows. Springs that feel physical. | Translucency everywhere, large-title headers that waste vertical space in tables. |
| **Google M3 Expressive** | Strong hierarchy (one primary action per screen, in one place). Colour and shape carry meaning: pills are statuses and filters, rounded rectangles are surfaces, a solid fill is "do this". Motion that explains state changes (status chip morphs, timeline line draws). | Tonal colour everywhere, bouncy oversized shapes. |
| **Nothing** | Monochrome base, one sharp accent. A dot-matrix face used *only* for big KPI digits. Monospace for IDs and document numbers. Honest, label-like typography. | Red as the accent (in a ledger, red must mean *overdue* or *short*), dot-matrix in tables or body text. |

---

## 1. Colour

### Accent: keep APEX saffron
Saffron `#F28C18` is already APEX's mark and the salesman app's "Take new order". It stays as the single accent. It is used
for: the active navigation indicator, the current selection, progress bars, the focus ring (a deeper saffron in light theme
to pass 3:1), the brand mark, KPI highlight dots and the salesman app's main action. **Primary buttons are ink** (near-black
in light, near-white in dark), so saffron never competes with the amber "Pending" status.

### Neutrals, light and dark (tuned for long sessions)
No pure white page, no pure black. Light theme is a warm off-white; dark theme is a soft charcoal. Large areas never use
saturated colour.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#F5F5F2` | `#111113` | Page |
| `surface` | `#FCFCFA` | `#18181B` | Cards, tables, sidebar |
| `raised` | `#FFFFFF` | `#202024` | Popovers, dialogs, sheets |
| `text` | `#1A1A1C` (15.9:1) | `#EDEDEA` (16.1:1) | Body and headings |
| `text-2` | `#55565C` (6.7:1) | `#A8A8AE` (8.0:1) | Secondary text, labels |
| `text-3` | `#6E6F76` (4.6:1) | `#8B8B92` (5.6:1) | Hints, placeholders (never below AA) |
| `border` | `#E3E3DE` | `#2C2C31` | Dividers (decorative) |
| `border-field` | `#8C8D93` (3.2:1) | `#6A6B72` (3.3:1) | Input outlines (meets 1.4.11) |
| `ink` | `#1A1A1C` | `#EDEDEA` | Primary button fill |
| `accent` | `#F28C18` | `#F59A2E` | Saffron fill (text on it: ink, 7.1:1 / 8.4:1) |
| `accent-text` / `focus` | `#A3570A` (4.9:1) | `#F7A645` (9.4:1) | Saffron as text/links; focus ring |

Ratios are measured against `bg`; every text token passes WCAG AA in both themes (script: `docs/redesign/contrast.py`).

### Status colours (the only other colour in the app)
Each status = **icon + label + colour**, so meaning never depends on colour. Chips are a tinted pill with a coloured icon
and dark label.

| Status | Icon (lucide) | Light fg / tint | Dark fg / tint | Contrast (fg on tint) L / D |
| --- | --- | --- | --- | --- |
| Pending | `Clock` | `#8A5300` / `#FBF0DC` | `#F2C063` / `#2B2214` | 5.6 / 9.3 |
| Confirmed | `CircleCheck` | `#1F5FB8` / `#E6EEFA` | `#8DB6F2` / `#16202F` | 5.3 / 7.9 |
| Dispatched | `Truck` | `#5B45B0` / `#EEEAF9` | `#B5A6F0` / `#211D30` | 6.1 / 7.5 |
| Delivered | `PackageCheck` | `#1E7A47` / `#E3F3EA` | `#7FD3A2` / `#14261C` | 4.7 / 8.9 |
| Overdue | `AlertTriangle` | `#B42318` / `#FBE9E7` | `#F59B92` / `#2E1714` | 5.6 / 8.0 |
| Short-stock | `PackageX` | same red as Overdue | same | 5.6 / 8.0 |
| Neutral (draft, cancelled, inactive) | `Circle` / `Ban` | `#55565C` / `#EEEEEA` | `#A8A8AE` / `#242428` | 6.0 / 7.0 |

How today's statuses map (`src/lib/status.ts` keeps its labels; only the look changes):
Quotation/Draft → Neutral · Pending dispatch, Waiting, Due today, Cheque not cleared, To visit, Promised → Pending ·
Not yet due, At the shop, With salesman → Confirmed · Dispatched/On the way → Dispatched · Delivered, Paid, Received,
Visited, Kept, GPS verified → Delivered · Overdue, Bounced, Missed, Broken, Outside shop area → Overdue · Short lines →
Short-stock · Cancelled → Neutral with strikethrough.

**Module colours go away.** The sidebar's 11 icon colours and the 8 tile tones become monochrome. Brands keep a tiny
identity dot (BLUEI blue, CONQRETE saffron) because staff use it to tell the two catalogues apart.

## 2. Typography

One family, three cuts, all from the `geist` package (self-hosted, so the strict CSP stays as is; all three have the ₹ sign
except Pixel, which falls back to Geist Sans for it):

| Role | Face | Where |
| --- | --- | --- |
| UI | **Geist Sans** (variable) | Everything |
| IDs and codes | **Geist Mono** | Invoice/order numbers, SKUs, GSTINs, retailer codes |
| Figures | **Geist Pixel · Circle** (dot-matrix) | Only big KPI digits on dashboards and the salesman app (≥ 28px). Never in tables, forms or body. |

Scale (px, 4pt rhythm): 12 · 13 · 14 (body) · 16 · 18 · 22 · 28 · 36, KPI 32/44. Nothing below 12px; the 86 uses of
10–11px go. All amounts, quantities and dates use `tabular-nums`. Money is right-aligned in tables.

## 3. Shape, space, depth

- **Spacing:** 4pt scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- **Radius (5 → 4 values, each with a job):** 8 controls (inputs, buttons) · 12 cards and tables · 20 dialogs and sheets ·
  full for status chips, filter chips and avatars.
- **Depth:** light theme separates with a hairline border plus a very soft shadow; dark theme separates by surface
  lightness (no shadows). Three elevations only: flat (page), surface (cards), raised (popovers, dialogs, toasts).

## 4. Indian formatting (kept, made consistent)
`inr()` already groups in lakh/crore (`en-IN`) and dates are already IST. Changes, display only:
- Dates read **17-Nov-2026** (DD-MMM-YYYY) everywhere on screen. PDFs keep their current format.
- KPI tiles show compact values that never truncate: **₹10.61 Cr**, **₹77.7 K**, with the full figure
  (₹10,61,13,236) on hover/long-press and on the detail page. Tables always show the full figure.

## 5. Density
A **Comfortable / Compact** switch in Settings and in every table's toolbar, remembered on the device.
Comfortable: 48px rows, 14px text. Compact: 36px rows, 13px text, tighter cell padding. Forms and phone screens stay
comfortable.

## 6. Motion character
Calm and quick. Things *settle* rather than bounce. Exits are faster than entrances. Nothing waits for an animation:
you can click or type while it settles. Full tokens and rules go in `src/lib/motion.ts` (Phase 3); the starting values
are the ones in the brief (instant 110ms, fast 160ms, base 240ms, slow 340ms max; snappy spring 500/32, gentle 260/30).

**Where I'm deliberately holding back** (brief rule: ease of use wins):

| Brief asks | What I'll do | Why |
| --- | --- | --- |
| Multi-step create invoice with sliding steps | Keep billing **one screen** (it's the fastest screen today, 1 click + keyboard). Add a slim progress header (Retailer → Products → Review) and slide only the review sheet. The salesman's phone order flow, already step-based, gets the slide-between-steps. | A wizard adds 2–3 clicks to the most repeated task in the business. |
| Rows stagger in on tables | First visit to a list per session only, capped at ~300ms total. Sorting/filtering use layout motion, no stagger. | Re-staggering on every filter makes scanning slower. |
| KPI count-ups | Once per session per dashboard, not on every return. Off in reduced motion. | Counting up a number you already know is a wait. |
| Page transitions (fade + 8px rise) | Yes, 200ms, interruptible, skipped for in-page tab switches that keep the same layout. | Tabs that "move" feel slower than tabs that swap. |
| Confetti | Only "monthly target hit" (salesman) — once. | Celebration on a routine save is noise. |
| Dot-matrix type | KPI digits only. | Dot-matrix is slow to read in tables. |

## 7. Navigation shape (detail in Phase 4)
Sidebar groups (monochrome, collapsible, sliding saffron indicator):
**Home** Dashboard · **Sales** Billing, Orders & invoices, Retailers, Routes · **Inventory** Stock, Products, Purchases ·
**Dispatch** · **Accounts** Payments, Expenses · **Reports** · **Settings** Users, Company, Import, Audit log, System health.
Same routes, same role rules (`src/lib/roles.ts` still decides what each role sees). Plus: ⌘/Ctrl K palette, `?` shortcut
sheet, recent + pinned items, one top bar (breadcrumbs, title, primary action) on every page, a bottom tab bar on phones for
office roles too, and long tab rows (Purchases' 7–8) collapse into a segmented control + "More".

## 8. Components and libraries
- Keep Tailwind 4. Rebuild `src/components/ui.tsx` on **Radix primitives in the shadcn style** (copied in, our tokens):
  Dialog, Sheet, Popover, DropdownMenu, Tooltip, Tabs, Switch. Same export names, so pages migrate one area at a time.
- Add: `motion` (via `LazyMotion` to keep the bundle small), `animejs` v4 (lazy-loaded, dashboard + empty states only),
  `cmdk`, `sonner`, `geist`, `vaul` (phone sheets with drag-to-dismiss), `@tanstack/react-virtual` (tables past ~200 rows).
- Native `confirm()` calls become a styled confirm dialog; safe actions get Undo in the toast instead.

## 9. The short-stock alert (preview)
On the billing screen, the moment a line goes short, a red banner slides in above the cart with one attention pulse and
then stays still:

> **3 items are short — this invoice can't go out in full.**
> 20000mAh Power Bank · need 12 · have 6 · **short 6**
> 65W Charger · need 4 · have 0 · **short 4** …

Short lines in the cart get the Short-stock chip. For billing staff the banner says what to do next (reduce quantity or
save a draft for a manager); for managers it carries the "Invoice anyway" switch. The rule (no partial dispatch, alert when
short) is unchanged; only its visibility goes up.

## 10. Decisions for Jay
1. **Accent:** keep APEX saffron (recommended) or switch to a Nothing-style red?
2. **Default theme:** follow the device's light/dark setting (recommended), or start in light?
3. **Base branch:** `brand-and-pricing-changes` is 8 commits ahead of `main` (with migrations 0033–0036) and is what staging
   runs. I recommend building `redesign/v2` on top of it, so the redesign isn't built on screens that are about to change;
   the production PR then waits until that branch has gone to production first.
