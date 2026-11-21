# APEX DMS redesign — 01 · Audit of the current UI

Branch audited: `brand-and-pricing-changes` @ `e56a487` (the newest UI, on staging). Date: 17-Nov-2026.
Method: full read of the app's routing, layouts and components, automated counts over `src/`, and screenshots of the
staging preview signed in as Super Admin (`docs/redesign/screens/before/`, 1440px and 390px). Desktop shots are captured at
the browser pane's resolution (about half size); they're for reference, not pixel review. Billing, Warehouse and Salesman
menus are taken from `src/lib/roles.ts` and the role branches in each page. Nothing in the app was changed for this audit.

---

## 1. What the app is built on

| Area | Today |
| --- | --- |
| Framework | Next.js 15.5 App Router, React 19.1, TypeScript, server actions |
| Styling | Tailwind CSS 4, a 10-line `@theme` (ink + saffron), everything else inline Tailwind classes |
| UI kit | Hand-rolled `src/components/ui.tsx` (Button, Input, Select, Textarea, Card, Badge, Alert, PageHeader) + `dialog`, `tabs`, `chip`, `stat-card`, `skeleton`, `charts`, `sortable`, `search-bar` |
| Icons | lucide-react |
| Fonts | System UI stack (no web font); Noto Sans embedded only in PDFs |
| Motion | None beyond CSS `transition` (30 uses), a shimmer skeleton and a top progress bar; both respect `prefers-reduced-motion` |
| Themes | Light only (0 `dark:` classes) |
| Data | Supabase (RLS is the gatekeeper); pages are server components with `force-dynamic` |
| Roles | `super_admin`, `manager`, `billing`, `warehouse`, `salesman` (`src/lib/roles.ts` decides only the menu) |
| Phone app | Separate salesman shell at `/m` with a 5-tab bottom bar and an offline outbox |

## 2. Inventory

**Screens: 89 pages** in 14 modules.

| Module | Pages | Sub-navigation |
| --- | --- | --- |
| Dashboard | 1 (3 variants: office, warehouse, salesman) | — |
| Products | 6 (list, detail, new, edit, settings) | buttons |
| Inventory (`/stock`) | 8 | `StockNav` — 6 tabs (own copy of the tab component) |
| Purchases | 17 | `Tabs` — **8 tabs** |
| Retailers | 6 (+ routes view) | buttons |
| Sales | 9 (billing, drafts/quotations, pending, invoices, order + invoice detail, edit) | `Tabs` — 4 tabs, title in layout |
| Dispatch | 1 board (pending / on the way / history) | in-page tabs |
| Payments | 8 (collections, verify, record, outstanding, promises, receipt) | `Tabs` — 5 tabs, title in layout |
| Routes | 14 (manage, plan, targets, places, assignments, incentives, today) | `manager-tabs` (third tab pattern) |
| Expenses | 2 | `Chip` row (fourth tab pattern) |
| Reports | 2 (index + 12+ report keys) | cards |
| Import | 1 | — |
| Admin | 4 (users, company, audit, health) | — |
| Account, login, org select | 4 | — |
| Salesman app `/m` | 14 | bottom tab bar |

**Components:** 27 shared components (1,761 lines). Most screens build their own tables, toolbars and empty states inline.

**Duplicated or inconsistent patterns (counted):**

| Pattern | Count | Problem |
| --- | --- | --- |
| Raw `<button>` vs `<Button>` | 150 vs 192 | Two button systems; raw ones each restyle hover, focus and size |
| Raw `<input>` vs `<Input>` | 102 vs 205 | Same for fields |
| Primary action recoloured per screen | Violet *Add New Retailer* (billing), magenta *New purchase*, teal *Dispatch full order*, green *Generate invoice*, ink *Add retailer* (retailers), six differently coloured action tiles on Inventory | The main button changes colour from screen to screen, so colour can't mean anything |
| Tables | 53 `<table>` in 44 files | Each table hand-built: header style, padding, empty row and sort differ |
| Sub-navigation | 4 patterns | `Tabs`, `StockNav`, `manager-tabs`, `Chip` |
| Corner radius | 5 values (`md`, `lg`, `xl`, `2xl`, `3xl`) | Used interchangeably on similar cards |
| Colour families | 18 Tailwind hues | Sidebar alone uses 11 hues for module icons; stat tiles 8 tones |
| Arbitrary font sizes | 89 (`text-[10px]`, `[11px]`, `[13.5px]`…) | 86 of them are 10–11px, often for important information |
| Native `confirm()` / `alert()` | 13 | Browser pop-ups break the look and can't be styled or undone |
| Hex colours in TSX | 59 | Mostly charts and the logo; fine, but not tokens |

**What already works well (keep):** Indian formatting helpers (`inr`, `qty`, `date` in IST), `tabular` numbers in money columns,
the billing screen's keyboard flow (F4 retailer, `/` search, F2 catalogue, Ctrl+Enter invoice), the salesman app's bottom bar and
offline outbox, the nav progress bar, reduced-motion handling on what little motion exists, plain-English copy.

## 3. Top 15 UX problems (ranked by daily cost)

| # | Problem | Who it hurts | Evidence |
| --- | --- | --- | --- |
| 1 | **No global search or command palette.** To find an invoice, retailer or product you first open its module, then search there. Reprinting an invoice is 4 clicks + typing. | Billing, manager | No search outside module pages |
| 2 | **Short-stock warning is late and vague.** In the cart a short line shows 11px red "Only X in stock"; the real block appears only in the final review dialog and lists product *names*, not *how many short*. A billing user who isn't a manager hits a dead end ("save a draft and ask a manager") at the last step. | Billing | `billing-screen.tsx` L404–436, L548–556 |
| 3 | **Tab overload.** Purchases has 8 tabs (two of them, "Goods to receive" and "Orders to receive", show the same count), Stock 6, Payments 5. On a phone these scroll sideways, hiding half. | All office roles | `purchases/layout.tsx`, `stock-nav.tsx` |
| 4 | **Dashboard has no hierarchy, and money gets cut off on phones.** Up to 18 KPI tiles, each in its own colour, with "act now" items (overdue, collections to verify, pending dispatch) given the same weight as "active retailers". At 390px the amounts are truncated: "₹10,61,…", "₹10,17,…" (same on Inventory). A cut-off rupee figure is worse than no figure. | Manager, billing | `dashboard-390.jpg`, `inventory-390.jpg` |
| 5 | **Colour carries no meaning.** 11 icon colours in the sidebar, 8 tile tones, recoloured primary buttons. Colour should mean status; today it decorates. | Everyone | `shell.tsx` COLORS map |
| 6 | **Four different sub-nav patterns and two page-title patterns** (layout `<h1>` in Sales/Payments vs `PageHeader` elsewhere). The primary action sits in a different place on each screen. | Everyone | see inventory |
| 7 | **Dialogs are not real modals.** No focus trap, no Escape, no `aria-modal`, focus is not returned; 13 actions use browser `confirm()`. | Keyboard users, everyone on phones | `components/dialog.tsx` |
| 8 | **Small, faint text.** 121 uses of `text-slate-400` (2.4–2.6:1 contrast, fails AA) and 86 uses of 10–11px text, including stock warnings and the mobile nav labels. Tiring over 8 hours. | Everyone, esp. long sessions | counts above |
| 9 | **No dark mode, no density setting.** Accounts and warehouse users stare at white tables all day; table users can't fit more rows. | Billing, warehouse | 0 `dark:` classes |
| 10 | **Office roles on a phone get a hamburger only.** Below 1024px the whole menu is a drawer; there is no bottom bar except in the salesman app. | Manager on the move, warehouse on a tablet | `shell.tsx` |
| 11 | **Empty states are one-liners with no action** ("No data yet.", "No orders here.") — 75 of them; few say what to do next. | New users, quiet days | grep of empty-state copy |
| 12 | **Loading states are mostly generic.** 29 of 89 pages have a shaped `loading.tsx`; the other 60 fall back to one generic skeleton, so the layout jumps when data lands. | Everyone, on slow mobile data | file count |
| 13 | **Keyboard shortcuts exist only on the billing screen** and aren't discoverable elsewhere (no `?` sheet, no `G then …` navigation). | Billing, manager | `billing-screen.tsx` L234 |
| 14 | **Statuses look different on different screens** and have no icon: "On the way" is teal on dispatch, "Pending" amber on one page and slate on another. | Everyone | `Badge` tone chosen per call site |
| 15 | **Small tap targets.** 28 controls are 28–32px (`h-8`, `size-7`, `size-8`), below 44px, several of them on phone screens (category arrows, photo remove, sync button). | Salesmen, warehouse on phones | counts above |

Also noted (not ranked): every Sales page runs two count queries in its layout just for tab badges; tables are not virtualised
(fine today, risky at 1,000+ rows); the sidebar has no recent or pinned items.

## 4. Top 5 tasks per role — clicks today

"Clicks" = clicks/taps from any other page to the point where the user starts the task (typing not counted). Desktop unless noted.

**Billing (office)**

| Task | Path today | Clicks |
| --- | --- | --- |
| Create invoice | Sidebar *Sales* (opens Billing) | 1 |
| Record payment | *Payments* → *Record payment* tab | 2 |
| Find a retailer | *Retailers* → search box → row | 3 |
| Check a product's stock | *Inventory* → search box | 2 |
| Reprint / WhatsApp an invoice | *Sales* → *Invoices* tab → search → row → PDF/WhatsApp | 4 |

**Manager** (also everything billing does)

| Task | Path today | Clicks |
| --- | --- | --- |
| Verify salesman collections | *Payments* → *Verify collections* | 2 |
| Approve expenses | *Expenses* → *To approve* chip | 2 |
| See overdue / outstanding | *Payments* → *Outstanding & ageing* | 2 |
| Open a report | *Reports* → report card | 2 |
| Override short stock on an invoice | Only inside the billing review dialog (tick box) | 1 + billing flow |

**Warehouse**

| Task | Path today | Clicks |
| --- | --- | --- |
| Dispatch an invoice | *Dispatch* → *Dispatch full order* → confirm | 3 |
| Print picking list | *Dispatch* → tick rows → *Picking list* | 3 |
| Mark delivered | *Dispatch* → *On the way* → *Delivered* | 3 |
| Receive goods | *Purchases* (opens Goods to receive) → order → receive | 3 |
| Stock entry / count | *Inventory* → *Stock entry* / *Stock verification* tab | 2 |

**Salesman (phone app `/m`)**

| Task | Path today | Taps |
| --- | --- | --- |
| New order | Centre tab *Order* | 1 |
| Today's route | Tab *Route* | 1 |
| Collect payment | *Outlets* → outlet → *Collect* | 3 |
| My collections | *More* → *My collections* | 2 |
| Add expense | *More* → *Expenses* | 2 |

**Super Admin**: Users, Company, Audit log, System health, Import are each 1 click from the sidebar.

Target after the redesign: every task above ≤ 2 clicks or 1 shortcut from anywhere (Phase 4). The after column is filled in
`03-qa.md`.

## 5. Accessibility review (WCAG 2.1 AA) — current UI

**Issues found:** 14 | **Critical:** 3 | **Major:** 7 | **Minor:** 4

### Perceivable
| # | Issue | Criterion | Severity | Fix |
| --- | --- | --- | --- | --- |
| 1 | Hint/secondary text `slate-400` on white/page bg is 2.4–2.6:1 (121 uses) | 1.4.3 Contrast | 🔴 Critical | Secondary text token ≥ 4.5:1 in both themes |
| 2 | `slate-500` text on the page background is 4.40:1 (just under) | 1.4.3 | 🟡 Major | Tokenised `text-2` at ≥ 6.5:1 |
| 3 | Input borders `slate-300` on white are 1.48:1, so fields are hard to see | 1.4.11 Non-text contrast | 🟡 Major | Field border token ≥ 3:1 |
| 4 | Focus outline and active-nav bar in saffron `#f28c18` on white are 2.46:1 | 1.4.11 / 2.4.7 | 🟡 Major | Darker focus ring in light theme (≥ 3:1), keep saffron as fill |
| 5 | "Administration" label in sidebar 10px gray-400 on gray-700 is 4.06:1 | 1.4.3 | 🟢 Minor | Larger label, higher contrast |
| 6 | Statuses rely on colour + word, never an icon; tone varies by screen | 1.4.1 Use of colour | 🟢 Minor | One `StatusChip` with icon + label |

### Operable
| # | Issue | Criterion | Severity | Fix |
| --- | --- | --- | --- | --- |
| 7 | Dialog has no focus trap, no Escape, focus not returned; mobile drawer the same | 2.1.2 / 2.4.3 | 🔴 Critical | Radix Dialog / sheet primitives |
| 8 | No skip-to-content link; sidebar is ~16 tab stops before the page | 2.4.1 Bypass blocks | 🟡 Major | Skip link + landmark roles |
| 9 | 28 controls are 28–32px | 2.5.5 Target size (AAA, but our brief requires 44px on phones) | 🟡 Major | 44px hit area on touch layouts |
| 10 | 12 `outline-none` without a replacement ring on some custom inputs | 2.4.7 Focus visible | 🟡 Major | Shared focus-ring token |

### Understandable
| # | Issue | Criterion | Severity | Fix |
| --- | --- | --- | --- | --- |
| 11 | Server-action errors sometimes shown with `alert()`; inline errors not tied to fields | 3.3.1 Error identification | 🟢 Minor | Inline message under the field (`aria-describedby`) + toast |
| 12 | Short-stock block appears only at the last step, without amounts | 3.3.4 Error prevention (AA for financial) | 🔴 Critical (business) | Inline short-stock banner with item, needed, available, short by |

### Robust
| # | Issue | Criterion | Severity | Fix |
| --- | --- | --- | --- | --- |
| 13 | Active nav item has no `aria-current` (2 uses app-wide); tabs are links without `aria-current="page"` | 4.1.2 Name, role, value | 🟡 Major | `aria-current` on nav + tabs |
| 14 | 314 `<th>` with no `scope`; status changes after actions not announced (2 live regions) | 1.3.1 / 4.1.3 Status messages | 🟢 Minor | Table primitive sets scope; toasts in a live region |

### Colour contrast (current)
| Element | Fg | Bg | Ratio | Need | Pass |
| --- | --- | --- | --- | --- | --- |
| Hint text `slate-400` | #94a3b8 | #ffffff | 2.56 | 4.5 | ❌ |
| Secondary text `slate-500` on page | #64748b | #f5f6f8 | 4.40 | 4.5 | ❌ |
| Secondary text `slate-500` on card | #64748b | #ffffff | 4.76 | 4.5 | ✅ |
| Field border `slate-300` | #cbd5e1 | #ffffff | 1.48 | 3.0 | ❌ |
| Focus ring / active bar saffron | #f28c18 | #ffffff | 2.46 | 3.0 | ❌ |
| Low-stock text `amber-700` | #b45309 | #ffffff | 5.02 | 4.5 | ✅ |
| Short-stock text `red-700` on `red-50` | #b91c1c | #fef2f2 | 5.91 | 4.5 | ✅ (but 11px) |
| Sidebar role label `gray-300` | #d1d5db | #374151 | 7.00 | 4.5 | ✅ |

Manual checks still to do on staging with the screenshots: 200% zoom, VoiceOver/TalkBack pass on the billing screen and
the salesman order flow.

## 6. Design critique (current UI)

*Run with `design:design-critique` against the code; repeated on the staging screenshots before sign-off.*

- **First impression.** Competent and plain-spoken, but busy: a dark slate sidebar full of coloured tiles next to a pale grey
  page full of coloured KPI tiles. Nothing tells you what to do first.
- **Hierarchy.** Page titles are modest (20–24px) while numbers in tiles are the loudest thing everywhere. Primary actions
  vary in colour and place. The billing screen is the strongest screen: clear steps, keyboard-first, a sticky cart.
- **Consistency.** Two button systems, four tab systems, five radii and eighteen hues are the main source of "it feels
  assembled, not designed".
- **Density.** Tables are reasonably dense, cards are roomy; there's no way to choose.
- **What to keep.** The billing flow's structure, plain-English copy, Indian number/date formatting, the salesman app's
  bottom bar and offline sync, the brand saffron as an identity colour.

## 7. What the staging screenshots add

| Screen | Observation |
| --- | --- |
| Dashboard (1440) | 17 tiles in a 4-column grid; three tinted red, one amber; the 30-day chart below is one tall bar and a lot of empty space. |
| Dashboard (390) | Two narrow columns; labels wrap to three lines and amounts are cut off ("₹10,61,…"). |
| Billing (1440) | Clear left-to-right flow (retailer → terms → products → cart). Four different button colours in one view (violet, ink, mint-disabled, outlined). Shortcut hint in 11px grey. |
| Billing (390) | Sales tabs run off the right edge ("Pending for dispat…"); the scan button is an icon on its own row. |
| Invoices (1440) | Good, readable table; status and delivery chips are two separate pastel styles; brand filter and status filter use two different chip styles. |
| Inventory (1440/390) | Six KPI tiles + six rainbow action buttons + a brand table before the product list. On a phone the product list starts after three screens of scrolling. |
| Dispatch (1440) | Card grid, one teal "Dispatch full order" per card; "Waiting 87d" chips are useful. Short lines show in red, e.g. "1,00,000 pcs". |
| Outstanding (1440) | Strong content (due windows, ageing bar) but three rows of cards before the table; the ageing bar is one solid red block. |
| Purchases (1440) | Super Admin sees 7 tabs; empty state is a small icon + one line + link; the primary button is magenta. |
| Retailers (1440) | The cleanest list screen: ink primary button, secondary buttons outlined, readable table. A good base for the new list pattern. |
| Salesman home `/m` (390) | The best-designed screen today: one dark summary card, an incentive card, a big orange "Take new order", bottom tab bar with a raised centre action. Keep its structure; bring it onto the new tokens. |
