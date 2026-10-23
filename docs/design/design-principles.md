# Design Principles

Status: Foundation draft · 2026-10-22

Meridian should feel like a **precision instrument**: calm, quick, trustworthy. People use it to make consequential judgements about other people, so the interface must never exaggerate, decorate, or guess silently.

## The seven principles

### 1. Evidence over assertion
Every claim the interface makes (a signal, a summary, a score, a chart) can be traced to records in one click. If we can't show why, we don't show it.
- *Do:* "Cooling: 1 engagement in 60 days (prev. 5)", linked to the engagements.
- *Don't:* a red "Relationship health: 42" with no derivation.

### 2. Calm by default, loud only when it matters
Neutral surfaces and type carry the interface. Colour is reserved for **meaning** (status, attention, selection), and attention colours are rationed so they keep their force.
- *Do:* one accent colour for interactive focus; amber/red only for overdue or at-risk.
- *Don't:* coloured cards for every section, gradient headers, rainbow tags.

### 3. Density with clarity
Our users manage hundreds of records. Show more per screen than consumer software does, and keep it legible through rhythm, alignment and hierarchy rather than boxes and shadows.
- *Do:* 32 px table rows in compact mode, aligned numerals, subtle row dividers.
- *Don't:* one record per oversized card, or whitespace used as a substitute for structure.

### 4. Keyboard first, pointer friendly
Every frequent action is reachable without a mouse and discoverable via ⌘K and on-hover shortcut hints. Pointer users never pay a penalty for this.

### 5. Context stays in place
Inspect without leaving: peek panels, inline editing, hover previews. Navigation is for changing *scope*, not for reading a detail.

### 6. Humans decide; AI proposes
AI output is visibly a *proposal* until a person accepts it. Facts and inferences look different. Nothing consequential is created, changed or sent automatically.

### 7. Respectful of people being described
Stakeholders are people who never consented to be in our customers' software. We avoid language and visuals that caricature them (no "enemy" red nodes, no "sentiment scores" for individuals), we support restriction of sensitive records, and we default to professional neutrality.

## Quality bar: what "world-class" means here

| Dimension | Bar |
|---|---|
| Speed | Route changes feel instant (< 100 ms perceived); optimistic updates for edits; no full-page spinners after first load. |
| Consistency | One way to do each thing: one filter model, one table, one panel, one date picker across the product. |
| Craft | Pixel-aligned to a 4 px grid; tabular numerals; truncation with full value on hover; no layout shift on load. |
| Accessibility | WCAG 2.2 AA minimum; full keyboard operation; screen-reader parity for the map. |
| Honesty | No fake data presented as real; sample data is labelled; empty states say what to do. |

## Anti-patterns (explicitly banned)

Generic KPI-card dashboards · gradient or glass surfaces as default chrome · decorative illustrations in working views · heavy drop shadows · radius > 12 px on working UI · icon-for-every-label · toasts for things that should be inline · confirmation dialogs for reversible actions (use undo) · "AI sparkle" buttons scattered through the UI · charts without axis labels or units · low-contrast grey-on-grey text.

## Tone of voice

Plain, specific, professional. Sentence case everywhere. Use verbs on buttons ("Log engagement", not "Submit"). Errors say what happened and what to do. AI text says what it is based on: "Based on 4 engagements since 3 Aug".
