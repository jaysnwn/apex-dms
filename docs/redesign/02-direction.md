# APEX DMS redesign — 02 · Design direction

> **Revision 2 (17-Nov-2026).** Jay turned down the first proposal ("Quiet ledger": saffron accent, dot-matrix
> figures). His brief for this revision: no orange, our own colours, inspiration from Google and Apple, light theme
> by default, add animations. What follows replaces the first proposal.

**Direction: "Clear".** A bright, calm work surface in the spirit of Google's Material 3 and Apple's apps: soft
off-white page, white cards, cool greys, **one blue** for everything you can act on, and colour otherwise only when it
means a status. Motion is quick and physical (springs), and explains what changed.

| From | We take |
| --- | --- |
| **Apple** | Content first; chrome recedes. Off-white page (#F5F6F8), cards a step lighter, hairline borders, soft shadows. Rounded, friendly shapes. Springs that settle without bouncing. |
| **Google M3** | One primary colour used consistently (filled buttons, selected states, focus). Soft "tonal" fills for the current page and chosen chips. Pills for status and filters. Motion that explains state changes (sliding indicators, the status chip changing, bars growing). |

## 1. Colour

All values live in `src/app/globals.css`. Seven ramps (neutral, blue, green, teal, amber, red, violet) for light and
dark, generated in OKLCH and checked with `docs/redesign/contrast.py`. Tailwind's own palette names map onto these
ramps (emerald → green, sky/indigo → blue, rose → red, orange/yellow → amber, fuchsia/pink/purple → violet), so all
89 pages follow both themes without per-page edits.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | #F5F6F8 | #121315 | Page |
| `surface` | #FCFDFD | #19191B | Cards, sidebar, tables |
| `raised` | #FFFFFF | #212224 | Dialogs, menus, the command palette |
| `text` | neutral-900 (17.4:1) | (14.7:1) | Body and headings |
| `text-2` | neutral-500 (5.9:1) | (6.6:1) | Secondary text |
| `text-3` | neutral-400 (4.9:1) | (5.0:1) | Hints, placeholders — still AA |
| `line` | neutral-200 | | Dividers |
| `field` | #8A8B8F (3:1+) | #6B6D72 | Input outlines (WCAG 1.4.11) |
| `primary` | blue-600 #156CDD (white text 5.0:1) | #61A4FF (dark text 7.5:1) | Buttons, links, focus, selection |
| `primary-soft` | blue-50 | dark blue tint | Current page in the menu, chosen chips |

No pure white page and no pure black in dark mode. No saturated colour on large areas (the only exception: hero
summary cards use a blue gradient, as Google and Apple do for a single highlight).

### Status colours
Every status chip is **icon + word + colour** (`Badge` in `src/components/ui.tsx`):

| Meaning | Colour | Icon | Examples |
| --- | --- | --- | --- |
| Waiting / due | amber | Clock | Pending dispatch, Due today, Cheque not cleared, To visit |
| Issued / in progress | blue | Dot | Not yet due, At the shop |
| On the way | teal | Truck | Dispatched |
| Done / paid | green | Check | Delivered, Paid, Received, Visited |
| Overdue / short / blocked | red | Warning | Overdue, Short by 6, Bounced, Missed |
| Draft | violet | Pen | Quotation |
| Cancelled / inactive | grey | Minus | Cancelled |

Text on every status tint passes AA in both themes (≥ 5.2:1 light, ≥ 7.5:1 dark).

## 2. Typography
**Geist Sans** for everything, **Geist Mono** for invoice numbers, SKUs and GSTINs (self-hosted; both include ₹).
Scale 12 · 13 · 14 (body) · 15 · 17 · 22 · 24 · 28. Nothing below 12px in new work. Tabular figures for every amount.

## 3. Shape and depth
Radius: 10px controls, 14px cards, 20px dialogs and sheets, full pills for chips, status and the menu highlight.
Depth: hairline border + soft shadow in light; lighter surfaces, no shadows, in dark.

## 4. Indian formatting
`inr()` lakh/crore grouping (en-IN) as before; dates now read **17-Nov-2026** everywhere (also in PDFs);
`inrCompact()` shows **₹10.61 Cr / ₹10.17 L** on tiles so figures are never cut off.

## 5. Preferences (My account → Display)
Theme Light (default) / Dark / Same as device · Tables Comfortable / Compact · Motion Full / Reduce. Saved on the
device in cookies, so the first paint is already right.

## 6. Motion
Tokens in `src/lib/motion.ts` (instant 110ms, fast 160ms, base 240ms, slow 340ms max; snappy spring 500/32, gentle
260/30; stagger 30ms capped at 300ms). Transform and opacity only, with one isolated exception (the sidebar width,
see the shell). Exits faster than entrances; nothing blocks input; reduced motion → short fades, no count-ups.

Held back for speed (brief rule: ease of use wins): billing stays one screen (no wizard); table rows don't re-stagger
on every filter; KPI count-ups run once per session; confetti only for a monthly target.
