# Design

<!-- impeccable:design-schema 1 -->

## World

Inherited, not invented. `tachles-admin` is an internal Operate-mode console for the same product as `mortgage-website` (a sibling Astro/Cloudflare project), and it reuses that project's design tokens verbatim (`mortgage-website/src/styles/tokens.css`) rather than establishing a new visual identity: same Heebo type family, same OKLCH petrol-neutral palette, same radii/shadow/motion scale, same Hebrew/RTL direction. What's added here is purely the Operate-mode layer the marketing site never needed: a sidebar/nav shell, a data table system, KPI tiles, inline-SVG charts, and status/tier badges.

Mode: **Operate**. The owner is in a task (reading numbers, finding a drop-off, checking a sync status), not being persuaded. Familiarity and density win over expression.

## Tokens

Copied as `tachles-admin/src/styles/tokens.css`, byte-identical to the source file, so the two projects can never silently drift into two different "brands." If the source tokens change, re-copy rather than fork.

Additions on top (in `src/styles/admin.css`), all derived from the existing token set — no new hues:

- `--c-nav-surface`: `var(--c-surface-2)` — the sidebar/topbar layer.
- Chart series colors: `--c-series-1: var(--c-accent)`, `--c-series-2: var(--c-savings)`, `--c-series-3: var(--c-attention)`, `--c-series-4: var(--c-text-3)`. Four is the ceiling per chart; more series means a table instead.
- Tier badges reuse existing semantic colors: A → `--c-savings`/`--c-savings-soft`, B → `--c-attention`/`--c-attention-soft`, C → `--c-text-3`/`--c-surface-2`.
- Freshness dot: ok → `--c-savings`, stale (>36h) → `--c-attention`, failed → `--c-danger`.

## Type

One family (Heebo) for everything, per Operate guidance — no display face. Fixed rem scale, not the marketing site's fluid clamp():

- Page title `--text-xl` (24px/700), section heading `--text-lg` (20px/700), body/table `--text-md` (17px), meta/labels `--text-sm` (15px), tabular numerals (`font-feature-settings: 'tnum'`) everywhere a number appears in a table or KPI tile, matching the source tokens' existing `tnum` usage.

## Layout

- Desktop: fixed-width right-hand sidebar nav (RTL: nav sits on the visual right) + content column, `max-width: 88rem` (wider than the marketing site's `--page-max: 72rem` — this surface is data-dense, not prose).
- Below `48rem`: sidebar collapses to a top bar with a horizontal scroll of nav chips (reusing the marketing site's existing `.chip` component from `components.css`).
- Tables scroll horizontally within a bordered `.table-wrap` (pattern already used in `mortgage-website/src/pages/admin/index.astro`) rather than reflowing to cards — Operate mode: density over adaptation tricks.

## Components

- **KPI tile**: label (`--text-sm`, `--c-text-2`) over value (`--text-xl`, tabular numerals) over a small Δ badge (savings-green up / attention-amber down, sign always shown). No icon, no card decoration beyond the existing `--shadow-card`/`--radius-lg` from tokens.
- **Data table**: reuses `.data-table` from `mortgage-website/src/styles/components.css` (zebra-free, border-bottom rows, `<th scope="row">` for the leading column, `.num` class right/left-aligned via `text-align` and `font-variant-numeric`). Sticky header on scroll.
- **Line/bar chart**: inline SVG, no charting library. Axis lines in `--c-border`, gridlines omitted (Operate: don't decorate what the numbers already show), one accent-colored line per series, a plain-text value on hover via native `<title>` (no JS tooltip library — keep the bundle at zero client JS where possible).
- **Freshness pill**: dot + relative time + source name, used identically in the header strip and on `/sources`.
- **Status/tier badge**: pill, `--radius-pill`, background = the semantic `-soft` token, text = the semantic ink token — same recipe the marketing site already uses for its tier column, just promoted to a reusable component.
- Every interactive element (nav link, table row link, "run now" button) gets default/hover/focus/disabled states from the existing token set — no invented affordances per the craft floor.

## Motion

150–220ms on hover/focus transitions only (existing `--dur-fast`/`--dur-base`). No page-load choreography, no chart entrance animation — Operate mode: the page is a workbench, not a moment.

## Explicitly not done here

No dark-mode-specific redesign (the inherited tokens already carry a dark variant — it just works). No icon library adopted (text labels only; the nav is small enough not to need icons). No client-side JS framework — interactivity (period picker, filters) is plain forms/query params, matching the marketing site's `/admin` pattern.
