# Interaction Guidelines

Status: Foundation draft · 2026-10-22 · Tokens referenced here are defined in [design-system.md](design-system.md).

## 1. Interaction model

Meridian has three layers of interaction depth. Each is reachable from the one above without losing place.

1. **Scan**: collections (tables, boards, map, grid) with filters and saved views.
2. **Peek**: the right-hand detail panel (Space / click). The list keeps its scroll, selection and filters.
3. **Focus**: the full record page (⌘↵ from peek, or direct link) for deep work: notes, history, linked items.

Back (`Esc` from peek, `⌘[` from page) always returns to the exact previous state, including scroll position and selection.

## 2. Keyboard system

Shortcuts are discoverable (⌘K lists every command with its key; `?` opens the cheat sheet; tooltips show keys) and are never the only path.

### Global
| Keys | Action |
|---|---|
| ⌘K | Command palette (navigate, create, act, Ask) |
| / | Search page |
| C | Quick capture |
| G then H/S/I/E/D/C/R | Go to Home / Stakeholders / Initiatives / Engagements / Decisions / Commitments / Reports |
| ⌘⇧1–9 | Switch workspace |
| ? | Shortcut reference |
| ⌘\ | Toggle sidebar |
| ⌘. | Toggle detail panel |

### Collections
| Keys | Action |
|---|---|
| J / K or ↓ / ↑ | Move row focus |
| Space | Peek focused record |
| ↵ / ⌘↵ | Open record / open in full page |
| X | Select row; Shift+X range |
| F | Add filter (opens filter menu at caret) |
| V then T/B/M/G/L | View: Table / Board / Map / Grid / List |
| E | Edit focused cell |
| ⌘A | Select all (in view) |
| Delete | Archive selected (undoable) |

### Records (create/assign)
| Keys | Action |
|---|---|
| C then P/O/E/D/M | New Person / Organization / Engagement / Decision / commitMent |
| A | Assign owner |
| S | Change status |
| ⇧D | Set due date |
| L | Link to initiative |
| ⌘⇧C | Create commitment from selected text (in notes) |

### AI review panel
| Keys | Action |
|---|---|
| A | Accept suggestion |
| E | Edit then accept |
| X | Reject (optional reason) |
| ⇧A | Accept all high-confidence |
| J / K | Next / previous suggestion (highlights source span) |

Rules: single-letter shortcuts are disabled while typing in inputs; sequences time out after 1 s; all shortcuts are remappable (v1.5); shortcuts never trigger destructive actions without undo.

## 3. Command palette

- Opens in < 50 ms with recent items and contextual commands first.
- Ranking: exact key match (`C-1021`) → contextual actions → recent records → fuzzy records → commands → settings.
- Scoped modes by prefix: `>` commands, `@` people, `#` initiatives, `?` Ask (AI Q&A).
- Actions on the current selection appear at the top when rows are selected ("Change status of 4 commitments").
- **Ask** answers stream inside the palette with citation chips. `⌘↵` expands into a full answer page that can be saved to a report.

## 4. Editing & feedback

| Situation | Pattern |
|---|---|
| Reversible change (status, field, archive) | Apply immediately, optimistic UI, undo toast (5 s) + `⌘Z` |
| Irreversible (purge, revoke access, decide a decision) | Confirm dialog naming the object and consequence |
| Validation error | Inline at the field on blur; never clear user input |
| Save of long text | Autosave every 2 s idle; "Saved" indicator in header; conflict → side-by-side merge |
| Concurrent edit | Live presence avatars on records; field-level last-write-wins with activity entry, rich-text is locked per-block |
| Network loss | Banner "Offline: changes will sync"; capture queues locally; destructive actions disabled |
| Long operation (import, report export) | Background job with progress in Inbox; never block the UI |

## 5. Filtering & views

- Filters are chips in a single bar: `Field · operator · value`. Click to edit, backspace to remove.
- Natural-language filter (v1.1): typing "high influence opposed not engaged in 60 days" in the filter bar proposes chips for confirmation. It does not apply opaque queries.
- Results update as filters change, debounced 150 ms; row additions/removals animate height and opacity (`motion-base`) so users can track what changed.
- Unsaved view changes show a "Save view / Reset" pair. Views are URL-encoded.

## 6. Panels and navigation transitions

| Transition | Motion |
|---|---|
| Route change between sections | Content cross-fade 140 ms; sidebar indicator slides 200 ms |
| Open peek panel | Slide from right 16 px + fade, 200 ms; list shrinks with the same timing (no jump) |
| Peek → full page | Panel expands to content width (shared-element, 280 ms) |
| Tab switch on record | Underline indicator slides; content fades 140 ms; no horizontal slide |
| Command palette | Scale .97→1 + fade, 140 ms in, 100 ms out |
| Dialog | Scrim fade 200 ms; dialog scale .97→1, 200 ms |
| View mode change (table ↔ map) | Cross-fade 280 ms; selected record stays selected and centred |

All transitions are interruptible; a new input cancels the running animation without waiting for it to finish.

## 7. Relationship graph interactions

See [stakeholder-universe.md](../product/stakeholder-universe.md) for the full specification. Summary:
- Hover a node → first-degree neighbours at full opacity; others dim to 20% (140 ms).
- Select → camera eases to centre (400 ms) only if the node is outside the central 60% of the viewport, so the view doesn't jump needlessly.
- Expand → new nodes enter from the parent's position, edges draw after nodes settle.
- Filter change → removed nodes fade out, layout re-settles over 400 ms with positions of persisting nodes preserved (no full re-shuffle).

## 8. Data updates & real-time

- Remote changes to a visible row: background pulse in `--accent-subtle` for 1.2 s (opacity only under reduced motion).
- New Inbox items: count badge increments; no sound by default.
- AI suggestion arrival: items stream into the review panel in order of source position.

## 9. Loading & success

- First load: app shell renders immediately from cache; data skeletons for ≤ 1 s, then content.
- Subsequent navigations: render from the client cache (stale-while-revalidate); a subtle 2 px progress line at the top appears only if revalidation exceeds 400 ms.
- Success is mostly silent and visible in place (the row updates). A toast appears only when an action happens out of view or can be undone.

## 10. Reduced motion & preferences

- Honour `prefers-reduced-motion`: no transforms, no camera animation in the graph, opacity fades ≤ 80 ms, shimmer disabled.
- In-app setting overrides OS preference in both directions.
- Density setting (Comfortable / Compact) persists per user.
- Respect `prefers-contrast: more`: borders move to `--border-strong`, tertiary text is promoted to secondary.

## 11. Writing for interactions

- Buttons: verb + object ("Record approval"). Menus: sentence case, no trailing ellipsis unless a dialog follows.
- Empty states: what this is, why it's empty, the one next action.
- Errors: what happened, whether data is safe, what to do ("Couldn't save the commitment. Your text is kept. Retry").
- AI copy: always states its basis ("From 3 meetings, Jun–Aug") and its nature ("Suggested", "Inferred").
