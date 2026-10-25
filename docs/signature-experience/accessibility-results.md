# Accessibility Results (Phase 8)

**Target:** WCAG 2.2 AA. **No compliance claim is made**: automated checks plus targeted keyboard checks are evidence, not certification, and no assistive-technology user tested the product.

## Automated: axe-core 4.10 (WCAG 2.0, 2.1 and 2.2 A/AA tags)
**Script:** `app/audit/sig-a11y.mjs`. **Evidence:** `evidence/a11y.json`. The run covered the sample workspace at 1440 × 900 and 390 × 844, in interactive states, not only first paint.

| State | 1440 | 390 |
|---|---|---|
| Command Center | clean | clean |
| Command Center · signal expanded | clean | clean |
| Command Center · briefing expanded | clean | clean |
| Universe (map) | clean | — (phones show the list) |
| Universe · focus panel open | clean | — |
| Universe (list on phones) | — | clean |
| Profile · Overview, Engagements, Relationships, Commitments, Timeline | clean (5/5) | clean (5/5) |

**Total:** 19 audited states, **0 violations**.

## Keyboard
| Check | Result |
|---|---|
| **Visible focus** on the first 12 Tab stops of Home, the map and the Directory | 36/36. *Method:* computed outline or box-shadow on the focused element. That is a heuristic; the screenshots were also inspected |
| **Command Center** | J/K move (the focused row now shows its quick actions only after keyboard use); Enter expands; D completes (with undo); E hides; O opens. The fold toggle is a button with `aria-expanded` and `aria-controls` |
| **Universe** | Arrow keys move between neighbours; [ and ] step through connections; Enter opens the profile; Esc closes the panel and returns focus to the canvas; + − 0 zoom; L toggles the list. In the panel, a related person is a button that moves the focus |
| **Profile** | Tabs are `role="tab"`; [ and ] switch tabs; Timeline filters are toggle buttons (`aria-pressed`); "Load older" is a button |
| **Journey** | The E2E journey uses role-based locators (heading, tab, button, checkbox, link) throughout. A broken accessible name would fail it |

## Graph alternatives
- **List view:** the default on phones, and one key (L) or one button away on desktop. It groups people by organisation, with stance badges as text.
- **Screen readers:** focus changes are announced through a live region ("Bea Ellwood, Concerned, Very high influence, 3 connections in view").
- **Not colour alone:** stance is encoded by colour plus a legend and text badges in every panel and list; relationship type by line style plus a text label on highlighted edges and in the panel.

## Reduced motion, zoom and touch
- **Reduced motion:** every Motion animation is instant, and the map camera jumps instead of animating (`frameFocus`, `reduceMotion()`).
- **Zoom:** no horizontal overflow at 320–1440 px on any flagship screen (`screenshots/after.json`).
- **Touch:** phone tab strips scroll; list rows are full-width buttons (row height not measured this phase). Map touch gestures are Cytoscape's (pinch and pan); phones open the list by default.

## Not verified
- Screen-reader walkthroughs (VoiceOver, NVDA) of the new Timeline and "What changed".
- Windows High Contrast or forced-colours mode.
- 200% browser zoom on desktop. The 320 px width test is the closest proxy.
