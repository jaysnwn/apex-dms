# APEX DMS redesign — 00 · Skills installed

All in `.claude/skills/` on `redesign/v2`. Each was cloned into a scratch folder first and checked for scripts,
network calls and instructions that fetch remote content before being copied in. Only Markdown/reference files were
copied; installer and validator scripts were left out.

| Skill | Source | Why | Notes |
| --- | --- | --- | --- |
| `motion-dev-animations` | github.com/199-biotechnologies/motion-dev-animations-skill | Motion (`motion/react`) patterns: layout, AnimatePresence, gestures | Its generic timings (0.6–0.8s entrances, 1.05 hover scale, parallax) conflict with the brief; a header note points to `src/lib/motion.ts`. Python validator not copied. |
| `animejs` | github.com/bowtiedswan/animejs-skills | Anime.js **v4** API (`animate`, `createTimeline`, `stagger`, `createDrawable`) | `install.sh` (curl into `~/.claude`) not copied or run. |
| `anime-js` (principles) | github.com/dylantarre/animation-principles, `skills/09-by-tool-framework/anime-js` | Timing, anticipation, follow-through | **Its samples are v3 syntax.** A header note says to use it for principles only and take syntax from `animejs`. |
| `shadcn` | github.com/shadcn-ui/ui, `skills/shadcn` (official) | Component composition on Radix + Tailwind v4 | Evals and agent configs not copied. Its CLI is used only with care (we copy components in by hand where the CLI would rewrite `globals.css`). |
| `tanstack-table` | github.com/secondsky/claude-skills | Large tables, virtualisation | Written for Cloudflare D1; we use only the client-side and virtual-row parts. |
| `vercel-react-best-practices` | github.com/vercel-labs/agent-skills | Next.js/React performance rules (bundle, server components, re-renders) | — |

Already available in the session (not copied): `frontend-design`, `21st-ui`, `design:design-system`,
`design:design-critique`, `design:accessibility-review`, `design:ux-copy`, `dataviz`.

**Skipped on purpose**
- `web-design-guidelines` (vercel-labs): it tells the agent to download its rules from GitHub at run time, i.e. remote
  instructions. Not installed.
- `react-view-transitions` (vercel-labs): needs React's canary `<ViewTransition>`; the app runs React 19.1 stable. The theme
  crossfade will call `document.startViewTransition` directly.
- `npx skills add …` was not run: cloning and copying the reviewed files gives the same result without executing a
  third-party installer.
