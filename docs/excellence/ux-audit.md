# UX Audit (Phase 6)

**Scope:**
- **Screens:** the 16 major screens, plus states (empty, loading, failed request, no results, onboarding).
- **Workflows:** A–G.
- **Interaction families:** buttons, navigation, tables, forms, drawers and dialogs, search.

**Evidence:**
- **Screenshots:** `screenshots/baseline`, `cycle1` and `responsive`.
- **Interaction traces:** under `app/scratch/p5`.
- **E2E specs:** `app/e2e/*.spec.ts`.

## Information architecture
- **Navigation is predictable.**
  - Seven primary destinations in a fixed sidebar (a bottom bar on phones), with initiatives as shortcuts.
  - Records have stable URLs (`/stakeholders/:id`, `/decisions?open=…`), so back and forward and shared links work. Covered by the expired-session E2E, which returns to the exact page.
- **Weakness found and fixed:**
  - The Command Center's first screen ranked the briefing above the action list (E6).
  - Following a signal's person always left Home; it now opens a peek (E28).
- **Remaining IA weakness:** three places show the Universe (Stakeholders›Map, the profile's ego network, the "Show in map" action). That's consistent, but a first-time user can't tell from the sidebar that the map exists under Stakeholders (P3: discoverability).

## Flagship experiences
### A. Intelligence Command Center
| Question it must answer | Where | Verdict |
|---|---|---|
| What requires attention? | "Needs attention" ledger, severity-sorted, filterable (All / Commitments / Decisions / Relationships) | ✓ Now above the fold on desktop and phone |
| What changed? | Briefing metrics (engagements in 7 days), recent engagements card | Partial: there's no "since your last visit" view (P3, would be a feature) |
| Which decisions are pending? | "Decisions in progress" card, ledger decision signals | ✓ |
| Which commitments are overdue? | Ledger, plus the horizon chart (overdue / this week / later) | ✓ All of them, however old (E1) |
| Which stakeholders need engagement? | Ledger "cooling" and "no owner" signals | ✓ |
| What should I do next? | Each signal's "Why it matters" with a deterministic next step and actions | ✓ |

**Signature interaction (select a signal → supporting records without losing context):**
- **Expand in place:** a signal expands to show the rule, the person, evidence engagements, a next step and actions.
- **The person:** opens in a peek beside the list (Esc closes) instead of navigating away (E28).
- **Verified** by `excellence.spec`.

**Decorative metrics:** none removed, because each card links to a filtered register: stance bar → stakeholders by stance, horizon → commitments, initiatives → initiative.

### B. Stakeholder Universe
**Strengths:**
- Group-by-organization layout, influence grid lens, stance colours with text labels, path finder (inferred hops dashed).
- Selection highlights the neighbourhood and dims the rest.
- Peek panel beside the map; accessible list alternative (`L`).

**Fixed:**
- overview label clutter (E15);
- dropped nodes (E13);
- mis-framed layouts (E14);
- camera queueing (E22);
- pan and zoom at scale (E3);
- the silent cap (E4).

**Open:**
- select latency at 2,000 people on slow CPUs (O1);
- small overview labels (O4);
- list virtualization (O3).

### C. Stakeholder Profile
**Assessment:** a well-organised intelligence workspace, not a contact form:
- identity, classification chips and a meta column (owner, last engaged, contact);
- a "Needs attention" strip;
- tabs (Overview / Engagements / Relationships / Commitments & decisions / History);
- a cited briefing, ego network and open commitments.

**Fixed:**
- phone header: breadcrumb (E19), separator (E20);
- relationship links not real links (E9);
- ego-graph hover lag (E24).

**Workflow B** (relationship → map → related profile) now passes end to end.

## Interaction families
| Family | Checked | Findings |
|---|---|---|
| **Buttons** | Hover and press feedback on token durations; loading state (`Button loading`); disabled; focus ring from tokens | No defects found in captures. Scrims no longer swallow clicks while closing (E29) |
| **Navigation** | Active state (sliding indicator), route transitions, back and forward, keyboard shortcuts (G H/S/M…, palette ⌘K) | Route flicker fixed (E5). Breadcrumbs on phones fixed (E19) |
| **Tables** | Row hover, J/K navigation, peek, sorting, filtering, archived toggle, counts | Sort headers now announced as buttons (E10). Counts labelled (E17). Commitments column clipping at 1024 fixed (E7). Toolbars no longer clip (E8) |
| **Forms** | Validation on submit and on edited fields, duplicate-submit guard (`useForm` in-flight), save and reload persistence | Phase 5 fixed blur validation shifting layout. **Workflow E** (search → filter → edit → save → reload) passes |
| **Drawers and dialogs** | Open and close, focus trap, Esc, return focus, scroll lock | Scripted checks pass |
| **Search** | Palette: keyboard-first, debounced (120 ms), recent items (cleared on sign-out since Phase 5), no-results state; Directory filter | No defects found. Directory search no longer resizes on focus (E25) |

## Error, empty and edge states
| State | Observed | Verdict |
|---|---|---|
| Empty workspace | Home shows a 4-step start; Directory, Universe and Commitments have their own empty states | ✓ |
| No search results | Directory filter typed with no match (`screenshots/cycle2/*-state-no-results-directory.png`) | ✓ "No stakeholders match these filters", a hint and "Clear filters"; toolbar reads "0 stakeholders". (The baseline capture had used a URL parameter the Directory ignores, so it showed the empty-workspace state instead; corrected and re-checked.) |
| Failed request | Inline "Couldn’t load this" + Retry; Retry recovers (E2E) | ✓ Copy fixed for reads (E16) |
| Slow network | Skeletons appear (API held 4 s) | ✓ |
| Lost connection | Offline banner; writes say unsaved | ✓ |
| Expired session | Back to sign-in, then the same page (E2E, Phase 5) | ✓ |
| Permission denied | Viewer has no billing controls (E2E); other tenants get 404 | ✓ |
| Concurrent update | Optimistic version check (`stale_version` → conflict message) | ✓ Server-tested in Phase 1 suites; not re-tested in the browser |
| Long names / missing avatars or metadata | Truncation with ellipsis; initials avatars; "—" for missing | ✓ |
| Unavailable AI provider | Briefing shows "Couldn’t prepare this briefing", app keeps working (E2E) | ✓ |
| Billing integration unavailable | Production without a provider shows no checkout; sandbox not testable | Unverified with a real provider |
