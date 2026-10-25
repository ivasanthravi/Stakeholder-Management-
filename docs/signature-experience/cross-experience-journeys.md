# Cross-Experience Journeys (Phase 8)

**Automated:** `app/e2e/signature.spec.ts` runs on an isolated stack (its own API and database) as part of the release gate. The data is created through the API; the journey is driven through the UI.

## The journey (requirement 7)
| Step | Action | What is asserted | Result |
|---|---|---|---|
| 1 | Open the Command Center | The headline says "1 overdue commitment" | ✓ |
| 2 | Identify the overdue commitment | Its "Why this is here" control expands it in place | ✓ |
| 3 | Open the associated stakeholder | "Open profile" → the profile heading is Priya Pathak | ✓ |
| 4 | Review engagement history | The Timeline lists "Junction design review" and "Send the junction drawings" as "Commitment raised" | ✓ |
| 5 | Explore related stakeholders | The Relationships tab links to Omar Okafor | ✓ |
| 6 | Open the Stakeholder Universe | "Show in map" → `view=map` | ✓ |
| 7 | Inspect the network | The arrow key focuses a person and the panel opens. Choosing the related person **in the panel moves the focus on the map**: the URL stays `view=map` and the panel switches to them. The panel lists the shared initiative (RVR) | ✓ |
| 8 | Return to the profile | Browser Back → Priya's profile | ✓ |
| 9 | Update the commitment | Complete it on the Commitments tab; the checkbox is `aria-checked=true` | ✓ |
| 10 | Return to the Command Center | The Home link | ✓ |
| 11 | Updated state reflected | No "overdue commitment" in the headline; the signal is gone; **What changed** lists "Send the junction drawings" as completed | ✓ |

**Run:** 2 of 2 tests passed (setup and journey) in about 9 s locally, and again in the full release gate (`final-quality-report.md`).

## What the journey preserves
| Concern | How |
|---|---|
| **Navigation context** | The peek and focus panels open beside the page. Back returns to the profile. Choosing a related person on the map stays on the map |
| **Selection** | The map opens focused on the person from the profile (`?focus=`). Moving between neighbours keeps the zoom |
| **Filters** | Command Center scope (Team / Assigned to me) and the briefing fold persist during a session. The briefing fold persists per device. The Universe scope lives in the URL |
| **Data consistency** | One cache (TanStack Query, keyed by workspace); every write invalidates it. Home, the profile, the registers and "What changed" read the same records |
| **Authorization** | Every request in the journey goes through the API with the user's session and row-level security; there is no client-side bypass |

## Other journeys covered by the suite
- **Home → peek → Escape** keeps Home (`excellence.spec.ts`).
- **Profile → add relationship → map → related profile** (`excellence.spec.ts`).
- **Search → filter → open → edit → reload** (`excellence.spec.ts`).
- **Workspace switching** shows only that workspace's records (`recovery.spec.ts`).

## Found while building the journey
- **Overlapping nodes in small groups.** In a two-person workspace the two people's nodes were drawn almost on top of each other inside their organisation group (first ring 35 px from the centre, nodes up to 36 px wide). The first rings now keep at least 52 px (`clusterLayout.ts`). Larger groups are unchanged.
- **Brief panel overlap.** The panel cross-fade briefly overlaps old and new content (about 80 ms). It is visible only in a frozen screenshot, and it is the existing Phase 6 behaviour; left as is.
