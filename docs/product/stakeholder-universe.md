# Stakeholder Universe: Relationship Map Concept

Status: Foundation draft · 2026-10-22 · Signature feature candidate.

## 1. Position in the product

The Stakeholder Universe is a **lens**, not a destination. It is a view mode of Stakeholders and of each Initiative's stakeholder tab, always **scoped**. Tables remain the default for operational work (sorting, bulk edits, registers). The map earns its place for questions that are inherently about structure:

| Question | Why a map beats a table |
|---|---|
| "How are we connected to the Minister's chief of staff?" | Paths are structural |
| "Who influences the approval of Decision D-104?" | Dependencies across parties |
| "Which high-influence stakeholders have no relationship owner?" | Gaps are visible as isolated nodes |
| "Which organizations cluster around opposition?" | Clusters are visual |
| "What changed in this network since March?" | Temporal diff is visual |

For "list everyone overdue for contact", use a table. The map links to filtered tables and vice versa, with selection preserved.

## 2. Visual grammar

| Element | Encoding |
|---|---|
| **Person node** | Circle; avatar initials; **size = influence** (4 steps); ring colour = stance (diverging palette + glyph); hollow ring = stance unknown |
| **Organization node** | Rounded square; size = number of linked stakeholders in scope; can be a **compound container** grouping its people (toggle) |
| **Internal colleague node** | Small circle with teal outline; shown only in "Our connections" lens |
| **Initiative / Decision anchors** | Diamond (decision) and hexagon (initiative) when the "Dependencies" lens is on |
| **Edge** | Line; **style = relationship type** (solid formal, dashed informal, dotted inferred-from-co-attendance); **width = strength** (1–3 px); arrowhead if directed; label on hover |
| **Recency halo** | Faint outer glow intensity = engagement recency (none if > 90 days). Optional overlay, off by default |
| **Selection** | 2 px accent ring; neighbours full opacity; others 20% |
| **Restricted** | Not rendered at all |

Edges inferred from co-attendance in meetings ("met together 4 times") are **visually distinct and labelled as derived**. Users can promote them to recorded relationships.

## 3. Lenses (preset configurations)

| Lens | Shows | Layout |
|---|---|---|
| **Network** (default) | People + orgs in scope, recorded relationships | Force-directed (fCoSE), clustered by org |
| **Influence** | Influence × interest positioning (axes), edges optional | Deterministic 2×2 grid layout. Not force; the graph version of the Mendelow grid |
| **Our connections** | Internal colleagues + their relationships to stakeholders; relationship owners | Bipartite (colleagues left, stakeholders right) |
| **Decision dependencies** | A decision, its approvers/consulted/affected, their relationships, linked commitments | Hierarchical (dagre / ELK layered) |
| **Organization** | Org hierarchy and affiliations | Tree (top-down) |
| **Change** | Map at date A vs date B: added/removed/changed edges | Positions frozen; diff colour-coded with legend |

## 4. Interactions

| Interaction | Behaviour |
|---|---|
| Zoom / pan | Wheel/pinch zoom (0.2×–3×), drag pan, `+`/`-`/`0` keys; semantic zoom: labels hidden below 0.6×, org clusters collapse below 0.4× |
| Search | `/` within the map: matching nodes highlight, camera fits them; results list in a side column |
| Filter | Same chip bar as tables: initiative, org, group, relationship type, influence, stance, last engaged, owner |
| Highlight connections | Hover → 1st-degree; `Shift`+hover → 2nd-degree |
| Expand | Double-click / `E` loads neighbours outside the current scope (count badge "+12" beforehand); expansions are listed as removable breadcrumbs |
| Path finder | Select two nodes → "Find paths" → up to 3 shortest paths (≤ 4 hops) with each hop's evidence |
| Inspect | Click → side panel (briefing, classifications, relationships with evidence, open items, actions) |
| Navigate to decisions | Panel lists decisions/commitments; clicking switches to Decision dependencies lens centred on that decision |
| Disconnected stakeholders | "Gaps" toggle: rings nodes with no relationships or no relationship owner; list of them in the side column |
| Edit relationships | Drag from a node's handle to another (pointer), or panel → "Add relationship" (keyboard). Every new edge asks for type; evidence optional |
| Pin / arrange | Drag to pin a node's position (saved per view); "Reset layout" unpins |
| Time slider | In Change lens: scrub dates; the graph renders state as-of |
| Save view | Lens + filters + pins + camera saved as a named view, shareable by URL |
| Export | PNG/SVG of current view (with legend + timestamp); CSV of nodes/edges |

## 5. Accessibility & alternatives

- **List view equivalent** (`V L`): an outline of nodes grouped by cluster, each expandable to its relationships, with identical filters. This is the canonical accessible representation, not an afterthought.
- **Keyboard traversal on the canvas:** `Tab` enters the graph at the selected/most central node; arrow keys move to the spatially nearest neighbour in that direction; `]`/`[` cycle through connected neighbours; `Enter` opens panel; `E` expands.
- **Screen readers:** focus announces "Jane Doe, person, Chief Planner at Westshire Council, influence very high, stance concerned, 6 relationships, last engaged 12 days ago". A live region announces filter result counts ("Showing 48 stakeholders, 73 relationships").
- Stance and type are never colour-only (glyphs, line styles).
- Reduced motion: layouts render final positions directly; no camera easing.

## 6. Scale strategy (no hairballs)

1. **Scoped by default.** Maps open on an initiative or a person's ego network (2 hops), never the whole workspace.
2. **Budget:** target ≤ 300 nodes / 800 edges rendered with full labels; hard cap 2,000 nodes per view.
3. **Aggregation beyond budget:** collapse by organization (compound nodes with counts) → by group → show a prompt to refine filters.
4. **Server-side scoping:** the API returns a subgraph for (scope, filters, depth) with node/edge counts first; the client decides to render or aggregate before fetching full payloads.
5. **Precomputed layout hints:** worker computes community clusters and centrality per workspace nightly and on significant change; used for initial positions and "key connector" badges (labelled as computed metrics, with explanation).
6. **Progressive rendering:** anchors and high-influence nodes first, then the rest; edges after nodes.
7. **Web Worker layout** so the main thread never blocks; layout > 1.5 s falls back to the list view with a progress indicator.

## 7. Library evaluation

| Criterion | **React Flow (xyflow)** | **Cytoscape.js** | **Sigma.js + Graphology** |
|---|---|---|---|
| Rendering | DOM/SVG (each node a React component) | Canvas (WebGL renderer experimental) | WebGL |
| Comfortable node count | ~hundreds (degrades with rich custom nodes beyond ~1k) | ~2–5k on canvas | 10k–100k+ |
| Layouts | None built in (bring dagre/ELK/d3-force) | Rich: fCoSE, CoSE-Bilkent, cola, dagre, ELK, concentric, grid; **compound nodes** native | Via Graphology (ForceAtlas2, circular, noverlap); no compound nodes |
| Graph algorithms | None | Built-in (BFS, Dijkstra, centrality, components) | Graphology standard library (comprehensive) |
| Custom node UI | **Excellent** (any React) | Style sheet-based; HTML overlays via extensions | Custom WebGL programs; labels limited |
| Editing (drag edges, handles) | **Excellent**, built for editors | Possible with extensions (edgehandles) | Manual |
| Accessibility | DOM nodes can be focusable/ARIA | Canvas: needs parallel a11y layer | Canvas: needs parallel a11y layer |
| React integration | Native | Wrapper (react-cytoscapejs) or imperative | @react-sigma |
| Licence | MIT (Pro subscription optional) | MIT | MIT |

**Decision: Cytoscape.js as the primary graph engine**, with **ELK** (`cytoscape-elk`) for layered/tree lenses and **fCoSE** for network lenses.
- Our render budget (≤ 300 typical, ≤ 2,000 cap) sits squarely in Cytoscape's comfortable range on canvas, with headroom React Flow lacks.
- **Compound nodes** (org containers) are native and central to our aggregation strategy.
- Built-in algorithms cover path-finding and neighbourhoods client-side.
- Layout quality for clustered, mixed-size graphs (fCoSE) is the best of the three.
- Accessibility is achieved via the **list-view equivalent** plus a hidden, synchronised focus layer (an offscreen ARIA tree mirroring the visible graph). We need that layer regardless of library, because DOM node counts would also hurt screen-reader usability at scale.

**Where React Flow is still used:** the **Decision dependencies editor** and template configuration diagrams (small, editable, rich node content). It is already in the stack's comfort zone and gives a superior editing UX.

**Why not Sigma.js:** its strength (100k+ nodes) solves a problem our scoping strategy deliberately avoids, and it lacks compound nodes and rich labels. Revisit only if a "whole-workspace overview" becomes a validated need, as an analytics-only view.

**Spike before commit (1 week):** render a 2,000-node / 5,000-edge synthetic workspace with fCoSE in a Web Worker; target first render < 1.5 s and 60 fps pan/zoom on a 2020 MacBook Air and a mid-range Windows laptop.

## 8. Data contract

```ts
GET /v1/graph?scope=initiative:{id}|party:{id}&depth=2&lens=network&filters=…
→ { counts: { nodes, edges, hiddenRestricted: never-returned },
    nodes: [{ id, kind, label, influence, stance, orgId, lastEngagedAt, flags }],
    edges: [{ id, source, target, type, directed, strength, derived, evidenceCount }],
    clusters: [{ id, label, memberIds }], asOf }
```
Permission filtering happens server-side before counts are computed. Restricted nodes are excluded from counts too.

## 9. Ethics guardrails for the map

- No "enemy", "threat" or red-alert framing; stance labels are neutral and human-assessed.
- Personal/family relationship types are disabled by default, require admin enablement, are excluded from AI, and carry a visible "sensitive" marker.
- The map shows **recorded** knowledge; derived edges are labelled as such; there are no speculative "hidden influence" inferences.
