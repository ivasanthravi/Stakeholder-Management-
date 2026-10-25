# Stakeholder Universe Review (Phase 8)

**Purpose:** make relationship networks understandable: who matters, how people connect, and what surrounds a person. The map never claims influence, sentiment or motivation beyond what someone recorded.

## Architecture (inspected, kept)
| Aspect | Implementation | Decision |
|---|---|---|
| Engine | Cytoscape 3.34, canvas renderer | Kept: suitable; replacing it would be novelty |
| Layouts | Organisation clusters (a custom deterministic layout), fcose network, influence × interest grid | Kept; the cluster layout's first ring was widened (small groups overlapped) |
| Large-map mode | More than 800 people: textured viewport, edges hidden while moving, no style transitions | Kept and extended (camera behaviour below) |
| State | Classes are diffed per element on hover, selection, search and paths (only changes restyle) | Kept |
| Data | `/graph`, capped at the 2,000 most influential people, with the cap stated | Kept (Phase 7) |
| Alternative | List view grouped by organisation; the default on phones | Kept |

## Passes
| Pass | Purpose | Change |
|---|---|---|
| **1. Readability** | The overview should say who matters | **Key people:** the most influential (then most connected) people, about 0.9 × √n (6 to 14, none under 31 people), are named at a constant 11.5 px on screen at any zoom. Everyone else keeps the zoom-scaled labels |
| **2. Focus mode** | Focus should show the relationships without losing your place | **Framing:** the camera keeps your zoom and moves only if the person or a direct connection is out of view. It zooms out only as far as needed and never zooms in. The focused person, their connections and highlighted edge labels become readable |
| **3. Relationship exploration** | Move between connected people without leaving the map; explain what ties mean | **Panel:** choosing a related person moves the focus on the map instead of opening their profile; it lists **initiatives** (with role) and **pending decisions involving them**; relationship types carry plain definitions ("Recorded as sharing a position on this work"), stating that every tie is recorded, not inferred |
| **4. Performance regression** | The measured cost of passes 1 and 2 at scale | Found by measurement and reduced in seven measured steps (`performance-results.md`): debounced resizing; no camera animation on large maps; a sort that walked the graph about 10,000 times; stylesheet bands for key people; per-element sizes for the roughly 13 focus elements, after band classes alone rendered clipped labels. **Load, pan and zoom are at or above Phase 7. Selection on maps of 1,000+ people is still +50–100 ms (1×)**, the cost of drawing names that Phase 7 didn't draw; accepted and tracked |
| **5. Small graphs** | Found in the E2E journey: two people in a group overlapped | First-ring minimum of 52 px in the cluster layout |

**Evidence:**
- `screenshots/before/universe-1440.png` vs `screenshots/after/i-05-universe-open.png` (overview);
- `before/i-06-universe-select-result.png` vs `after/i-07-universe-select-result.png` (focus);
- `evidence/graph/shot-sim-*.png` (Profiles A–D).

## Search & navigate (requirement 5.6), as it stands
| Capability | State |
|---|---|
| Fast search | "Find in map" filters as you type, highlights matches and frames them. Small match sets (25 or fewer) get readable names (new) |
| Keyboard | Arrows to the nearest neighbour in that direction; [ and ] through connections; Enter opens the profile; Esc clears; + − 0 zoom; L list |
| Zoom to selection | Search frames the matches; selection frames the neighbourhood (new behaviour) |
| Clear filter state | Initiative, stance and relationship chips show their values; the "N hidden" control counts what the filters remove |
| Reset view | The fit button and the 0 key |
| Accessible alternative | List view (L), grouped by organisation |

## Performance
See `performance-results.md`: Phase 7 against Phase 8, alternating on Profile D, because the machine was under outside load during this phase.

## Remaining
- **At the 2,000-person cap on a 4× slower CPU the map is still not smooth.** This is Phase 7 R4, unchanged in nature.
- **The panel's subject change cross-fades** with a brief (about 80 ms) overlap.
- **Clustering and summarising very large maps** (for example, organisation-level aggregation above 1,000 people) was considered and not built. It changes what the map shows and needs a design decision.
