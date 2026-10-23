# Design System: "Meridian Foundations"

Status: Foundation draft · 2026-10-22 · Light-mode first, dark mode supported from v1.
Implementation target: CSS custom properties → Tailwind v4 `@theme` → React components (Radix primitives). Token names are stable contracts.

---

## 1. Identity in one paragraph

A cool, paper-white workspace with ink-dark type and a single **deep teal** accent. It recalls survey instruments and nautical charts (a *meridian* is a line of reference), not tech-startup purple. The UI is set in a precise neo-grotesque. **AI briefings and reports use a text serif**, so narrative intelligence reads like a well-edited dossier and is visibly different from the structured UI chrome around it.

---

## 2. Typography

| Role | Family | Fallback | Why |
|---|---|---|---|
| UI | **Inter Variable** (opsz axis, `tnum`, `cv11`, `ss03`) | system-ui, -apple-system, "Segoe UI" | Proven legibility at 12–14 px, excellent tabular figures for dense tables |
| Narrative (briefings, AI summaries, reports) | **Newsreader** (variable, OFL) | Georgia, serif | Gives AI-authored and long-form text its own voice; improves reading comfort |
| Mono (IDs, code, keyboard hints) | **JetBrains Mono** | ui-monospace, SF Mono | Distinct `0/O`, `1/l` for record keys like `C-1021` |

### Type scale (rem at 16 px root; UI defaults to 14 px body)

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 28 / 34 | 600, tracking -0.02em | Page titles on record pages |
| `text-title` | 20 / 28 | 600, -0.015em | Section titles, dialog titles |
| `text-heading` | 16 / 24 | 600, -0.01em | Panel headings, group headers |
| `text-body` | 14 / 20 | 400 | Default UI text, table cells |
| `text-body-strong` | 14 / 20 | 550 | Record names in tables, labels |
| `text-small` | 13 / 18 | 400 | Secondary metadata, filter chips |
| `text-caption` | 12 / 16 | 500, +0.01em | Column headers (sentence case, not uppercase), timestamps |
| `text-micro` | 11 / 14 | 500 | Badges, keyboard hints only |
| `narrative-body` | 16 / 26 Newsreader | 400 | Briefings, report prose |
| `narrative-lede` | 19 / 28 Newsreader | 450 | Report opening paragraph |

Rules: max 3 sizes per view region; numbers in tables use `font-variant-numeric: tabular-nums`; measure 60–75 ch for narrative; never all-caps headers except the 11 px section labels in the sidebar (`FAVORITES`), tracking +0.06em.

---

## 3. Colour tokens

Defined in OKLCH for perceptual consistency; hex shown for reference. **Semantic tokens only in components**. Primitive scales are never referenced directly.

### 3.1 Primitives

| Scale | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Slate** (cool neutral) | #F8F9FA | #F1F3F5 | #E4E7EB | #CDD2D9 | #9AA3AF | #6B7482 | #4D5562 | #373E49 | #232931 | #151A20 | #0C0F13 |
| **Teal** (accent) | #EEF8F7 | #D3EEEB | #A7DCD6 | #6FC2BA | #3AA39A | #17857D | #0E6B65 | #0D5652 | #0E4542 | #0C3633 | #072220 |
| **Amber** (attention) | #FFF8EB | #FDEBC8 | #FAD48D | #F5B54D | #EC9625 | #D27812 | #AE5C0D | #8B4610 | #723912 | #5E3012 | #361805 |
| **Red** (critical) | #FEF3F2 | #FEE2E0 | #FCC9C5 | #F7A39C | #EE6F65 | #DE473C | #C0322A | #9E2A24 | #832823 | #6D2622 | #3B0F0D |
| **Green** (positive) | #F0F9F3 | #DAF1E1 | #B5E2C4 | #82CB9E | #4FAE76 | #2F9159 | #237447 | #1E5C3A | #1B4A30 | #173D29 | #0A2215 |
| **Violet** (AI marker) | #F6F4FE | #ECE8FC | #DAD3F9 | #BEB1F3 | #9A85EA | #7C61DF | #6A49CF | #583AB0 | #4A3290 | #3D2B74 | #251A47 |

Violet is used **only** to mark AI-generated or AI-proposed content (a 2 px left rule, the "AI draft" label, suggestion chips). It must not appear anywhere else, so its meaning stays unambiguous.

### 3.2 Semantic tokens (light → dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-canvas` | slate-50 | #0F1216 | App background |
| `--bg-surface` | #FFFFFF | #161A1F | Panels, tables, cards |
| `--bg-surface-raised` | #FFFFFF | #1C2127 | Popovers, dialogs, menus |
| `--bg-subtle` | slate-100 | #1A1F25 | Hover rows, sidebar, input fill |
| `--bg-selected` | teal-50 | teal-950 | Selected row / nav item |
| `--border-default` | slate-200 | #262C34 | Dividers, inputs, cards |
| `--border-strong` | slate-300 | #343B45 | Input hover, table header bottom |
| `--border-focus` | teal-600 | teal-400 | Focus ring (2 px + 2 px offset) |
| `--text-primary` | slate-900 | #E9ECEF | Primary text |
| `--text-secondary` | slate-600 | #A3ACB8 | Metadata (≥ 4.5:1 on surface) |
| `--text-tertiary` | slate-500 | #7D8794 | Placeholders, disabled (≥ 3:1, non-essential only) |
| `--text-on-accent` | #FFFFFF | #FFFFFF | Text on accent buttons |
| `--accent` | teal-600 | teal-400 | Primary buttons, links, active states |
| `--accent-hover` | teal-700 | teal-300 | |
| `--accent-subtle` | teal-50 | teal-950 | Accent backgrounds |
| `--attention` / `-subtle` | amber-600 / amber-50 | amber-400 / #2A1D0B | Due soon, needs review |
| `--critical` / `-subtle` | red-600 / red-50 | red-400 / #2C1412 | Overdue, failed, destructive |
| `--positive` / `-subtle` | green-600 / green-50 | green-400 / #0F2318 | Fulfilled, approved |
| `--ai` / `--ai-subtle` | violet-600 / violet-50 | violet-400 / #1E1833 | AI proposals and drafts only |

### 3.3 Data-visualisation palette

Categorical (8, colour-blind-checked order): teal-600, #C2410C, #4F46E5, #A16207, #0E7490, #BE185D, #4D7C0F, slate-500.
Stance scale (diverging, not red/green): Opposed `#9E2A24` → Concerned `#D27812` → Neutral `slate-400` → Supporter `#3AA39A` → Champion `#0D5652`, always paired with label text or icon shape, never colour alone.
Influence: encoded by **node size** and a 1–4 dot glyph, not colour.

---

## 4. Spacing, grid, layout

**Base unit 4 px.** Scale tokens: `0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- Inside components: 4–12. Between related groups: 16–24. Between page sections: 32–48.

**App frame**
| Region | Size |
|---|---|
| Sidebar | 240 px (resizable 200–320), collapsed 56 px |
| Top bar (within content) | 48 px |
| Content max width (record pages) | 1120 px, centred; collections are full-width |
| Detail/peek panel | 440 px (resizable 360–720) |
| Page gutter | 24 px (≥1280), 16 px (<768) |

**Grid:** 12-column fluid grid with 24 px gutters for record pages and reports. Collections use full-bleed tables.
**Breakpoints:** `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.

---

## 5. Radii, borders, elevation

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 4 px | Badges, chips, checkboxes |
| `radius-sm` | 6 px | Inputs, buttons, menu items |
| `radius-md` | 8 px | Cards, popovers, panels |
| `radius-lg` | 12 px | Dialogs, command palette (maximum on working UI) |
| `radius-full` | 9999 | Avatars, status dots |

Borders: 1 px `--border-default`. Separation is achieved with borders and background steps first, and shadow only when something floats.

| Elevation | Shadow (light) | Use |
|---|---|---|
| `elev-0` | none | Inline surfaces |
| `elev-1` | `0 1px 2px rgb(16 24 40 / .05)` | Sticky headers, dragged rows |
| `elev-2` | `0 4px 12px -2px rgb(16 24 40 / .08), 0 0 0 1px rgb(16 24 40 / .04)` | Popovers, menus, peek panel |
| `elev-3` | `0 16px 40px -8px rgb(16 24 40 / .16), 0 0 0 1px rgb(16 24 40 / .05)` | Dialogs, command palette |

Dark mode replaces shadows with a 1 px lighter border and a surface step.

---

## 6. Iconography

- **Lucide** (ISC licence) at 16 px (UI) and 14 px (dense tables), 1.5 px stroke; 20 px only in empty states.
- Icons accompany labels where they aid scanning (nav, object types, menu items), never as decoration. Icon-only buttons require tooltips and `aria-label`.
- Object-type glyphs are fixed: Person `user`, Organization `building-2`, Initiative `target`, Engagement `messages-square`, Decision `scale`, Approval `badge-check`, Commitment `handshake`, Risk `triangle-alert`, Document `file-text`, AI `sparkle` (violet only, used sparingly).

---

## 7. Components

### 7.1 Tables (the most important component)
- Row height: **36 px comfortable / 32 px compact**; header 32 px, `text-caption`, `--text-secondary`, sticky.
- First column (record name) sticky on horizontal scroll; checkbox column 32 px appears on hover/selection.
- Cells: left-aligned text, right-aligned numbers, dates as relative ("3d ago") with absolute on hover.
- Inline edit: click (or `Enter`) on an editable cell → editor in place; `Esc` cancels; `Tab` moves.
- Selection: `X` toggles row, `Shift+click` ranges, bulk action bar slides up from the bottom (no layout shift).
- Grouping rows: collapsible with counts. Column resize, reorder, pin; virtualised beyond 100 rows (TanStack Table + TanStack Virtual).
- Empty column values show `—` in tertiary, never blank.

### 7.2 Forms
- Labels above inputs (`text-small`, 550). Helper text below, `text-secondary`. Error text replaces helper, `--critical`, with icon.
- Input height 32 px (default), 28 px (compact/inline), 36 px (onboarding).
- Validate on blur; never block typing. Required marker is a word ("Required"), not just an asterisk.
- Party pickers: typeahead with avatar, org and email; "Create '…'" as last option.
- Long forms are avoided. Prefer create-with-minimum, then edit inline on the record page.

### 7.3 Buttons
| Variant | Style |
|---|---|
| Primary | `--accent` fill, white text. One per view region. |
| Secondary | Surface fill, 1 px border-strong |
| Ghost | No border; subtle bg on hover. Toolbar default. |
| Destructive | `--critical` text on secondary; fill only in confirm dialogs |
| AI | Ghost with violet icon. Used for "Extract", "Draft summary". |
Sizes 28 / 32 / 36 px. Keyboard hint chip (`text-micro`, mono) shown on hover in tooltips.

### 7.4 Cards
Used sparingly: Home attention items, report sections, template picker. Border + `radius-md` + 16 px padding, no shadow. Never nest cards.

### 7.5 Navigation
Sidebar items 28 px tall, 8 px horizontal padding, icon + label, `--bg-selected` + teal text for active. Section tabs on record pages: underline indicator (2 px accent), 40 px tall, keyboard `[`/`]` to switch.

### 7.6 Dialogs
Centered, `radius-lg`, `elev-3`, max width 480 (confirm) / 640 (form) px. Scrim `rgb(12 15 19 / .32)`. Focus trapped; `Esc` closes unless there are unsaved changes (then inline "Discard changes?"). Destructive confirmations require naming the object ("Delete 3 commitments").

### 7.7 Drawers / peek panel
Right-anchored, overlays or pushes content depending on width. Header: object glyph, title, key (`C-1021`), actions, expand (⌘↵), close (`Esc`). Up/down arrow (`J`/`K`) moves to the next record in the underlying list while the panel stays open.

### 7.8 Badges & status
Status pill: 20 px tall, `radius-xs`, subtle background + strong text + 6 px dot. Statuses map to semantic colours: Open (slate), In progress (teal), Due soon (amber), Overdue (red), Fulfilled/Approved (green), Proposed by AI (violet outline).

### 7.9 Empty states
Structure: 20 px icon (tertiary) · one-line title · one sentence of explanation · primary action · secondary "Learn more". Never illustrations in working views. Filtered-empty states offer "Clear filters".

### 7.10 Loading states
- Skeletons matching final layout (table rows, panel sections) with a subtle 1.2 s shimmer (disabled under reduced motion).
- Content arrives progressively; no blocking spinners after first paint.
- Inline spinners (12 px) only for button-level async actions > 300 ms.
- AI streaming: tokens appear in place with a violet caret. Partial results are usable.

### 7.11 Toasts
Bottom-left, used for **undoable** actions only ("Commitment closed · Undo"), 5 s, pause on hover. Errors that need action stay inline.

---

## 8. Motion tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-instant` | 80 ms | linear | Hover/press colour changes |
| `motion-fast` | 140 ms | `cubic-bezier(.2,0,0,1)` (standard) | Menus, tooltips, chips |
| `motion-base` | 200 ms | standard | Panels, tab indicator, row expand |
| `motion-slow` | 280 ms | `cubic-bezier(.3,0,0,1)` (emphasised) | Dialog, command palette, view-mode change |
| `motion-graph` | 400 ms | `cubic-bezier(.25,.1,.25,1)` | Graph layout transitions |
| `motion-exit` factor | ×0.75 | `cubic-bezier(.4,0,1,1)` | Exits are faster than entrances |

Distances: panels translate 16 px + fade; menus 4 px + scale .98→1; dialogs scale .97→1 + fade.
`prefers-reduced-motion: reduce` → all transforms removed, durations ≤ 80 ms opacity only, graph re-layouts jump-cut, shimmer off.

---

## 9. Accessibility standards

- **WCAG 2.2 AA** across the product; AAA contrast for body text where feasible (slate-900 on white = 16.9:1).
- Text contrast ≥ 4.5:1; UI component boundaries and focus indicators ≥ 3:1.
- Visible focus ring on every focusable element (2 px `--border-focus`, 2 px offset). Never removed.
- Target size ≥ 24×24 px (2.5.8); 32 px default for primary controls.
- Status never by colour alone: dot + label, or icon shape.
- Full keyboard operation including tables (grid pattern with roving tabindex), map (see stakeholder-universe doc), and drag-and-drop alternatives (move via menu).
- ARIA live regions for async results, AI streaming completion, and bulk-action outcomes.
- Respect OS text scaling up to 200% without loss; layout reflows at 320 CSS px.
- Forms: programmatic labels, `aria-describedby` for errors, error summary on submit.
- Automated: axe-core in CI on every route; manual screen-reader passes (VoiceOver, NVDA) per release.

---

## 10. Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥ 1536 | Sidebar + content + persistent peek panel option |
| 1280–1535 | Default three-region layout; peek overlays on narrower content |
| 1024–1279 | Sidebar collapses to icons on demand; peek as overlay |
| 768–1023 | Sidebar becomes drawer; tables prioritise columns by importance (column `priority` metadata) |
| < 768 | Bottom nav (Home · Search · Capture · Inbox); tables become stacked lists; map defaults to list view; capture is first-class |

---

## 11. Token delivery

```css
@theme {
  --font-sans: "Inter Variable", system-ui, sans-serif;
  --font-serif: "Newsreader", Georgia, serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --color-accent: oklch(0.47 0.08 186);   /* teal-600 #0E6B65 */
  --color-ai: oklch(0.50 0.19 288);       /* violet-600 */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --ease-standard: cubic-bezier(.2,0,0,1);
  --duration-base: 200ms;
}
```

Source of truth: `packages/tokens/tokens.json` (W3C Design Tokens format) → generated CSS variables, Tailwind theme, and Figma variables (via the Figma Console MCP `figma_setup_design_tokens` once a Figma file is designated).
