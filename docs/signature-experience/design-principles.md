# Signature Experience Design Principles (Phase 8)

These principles held every Phase 8 change to the same standard across the three flagship screens. They build on the existing design system (`docs/design/design-system.md`, `app/src/styles/tokens.css`). **No new colours, fonts, shadows or libraries were introduced.**

| Principle | What it means here | Where Phase 8 applied it |
|---|---|---|
| **1. Information before decoration** | The first thing on each screen answers a question. Chrome, counts and labels that repeat what is already on screen are removed or folded | The Command Center briefing folds when it only restates the headline. The profile briefing opens with *why this person matters* (their initiatives), not the identity already in the header |
| **2. Progressive disclosure** | The summary is visible; the detail is one action away and remembered | The briefing fold, with the choice remembered per device. Signal rows expand in place (why, evidence, next step). Timeline filters |
| **3. Context preservation** | Investigating something doesn't lose your place | Attention rows keep a full-width title, and quick actions overlay rather than reserve space. On the map, choosing a related person moves the focus there instead of leaving the map. Focus keeps your zoom |
| **4. Spatial consistency** | Things move predictably; the camera never jumps without reason | Map focus moves the camera only when the person or a direct connection is out of view, and only zooms out as far as needed. It never zooms in |
| **5. Quiet confidence** | No glow, pulse, particles or decorative gradients. Accent colour marks state, not ornament | The new elements ("What changed", Timeline, panel sections) reuse existing tokens, type styles and row patterns |
| **6. Speed is a design feature** | No added waits; heavy work stays off the interaction path | Key-label sizing touches at most about 25 nodes per zoom frame. The timeline pages 40 at a time on the server. "What changed" fetches exact counts plus six rows |
| **7. Evidence builds trust** | Every derived statement links to the record it came from; AI and rule output is labelled; nothing is inferred about people | "What changed" and Timeline lines all open their source record. Relationship types have plain definitions stating they are recorded, not inferred. The rules engine is labelled "no AI interpretation" |

## Shared patterns across the three experiences
| Pattern | Command Center | Universe | Profile |
|---|---|---|---|
| **Two-line list row** (title, then muted detail; time on the right) | What changed, Recent engagements | Panel: initiatives, decisions | Timeline |
| **Contextual panel** that keeps the page in view | Peek from a signal | Focus panel | — (the profile *is* the context) |
| **Filter chips / tabs** | Needs attention tabs (they scroll on phones) | Initiative / stance / relationship menus | Timeline kinds; engagement kinds |
| **Source attribution** | Evidence and "How?" on signals | Relationship type definitions | Kind, key and initiative on every line |
| **Keyboard** | J/K, Enter, D, E, O | Arrows, [ ], Enter, Esc, + − 0, L | [ ] tabs, M map, E edit, L log |

## Not changed, deliberately
- **Navigation, the sidebar, the top bar and page structure:** already consistent across screens, and the approved UI.
- **Colour and type tokens:** the light-mode palette passed contrast in Phase 6. No dark mode exists, and none was added.
- **The graph engine (Cytoscape) and its layouts:** suitable; replacing them would be novelty, not improvement.
