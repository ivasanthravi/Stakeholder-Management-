# Meridian: Foundation Docs

Universal AI-native stakeholder intelligence platform. _Every relationship. Every decision. One intelligent workspace._
("Meridian" is a working name.)

| Area | Document |
|---|---|
| Environment | [environment-capability-report.md](environment-capability-report.md) |
| Research | [research/competitive-intelligence.md](research/competitive-intelligence.md) |
| Product | [product/product-strategy.md](product/product-strategy.md) · [product/information-architecture.md](product/information-architecture.md) · [product/user-journeys.md](product/user-journeys.md) · [product/stakeholder-universe.md](product/stakeholder-universe.md) |
| Architecture | [architecture/domain-model.md](architecture/domain-model.md) · [architecture/ai-intelligence-layer.md](architecture/ai-intelligence-layer.md) · [architecture/api.md](architecture/api.md) |
| Design | [design/design-principles.md](design/design-principles.md) · [design/design-system.md](design/design-system.md) · [design/interaction-guidelines.md](design/interaction-guidelines.md) · [design/motion-system.md](design/motion-system.md) |
| Prototype | [../app/README.md](../app/README.md) · [audit/phase-0-audit.md](audit/phase-0-audit.md) (current) · [review/phase-0-quality-review.md](review/phase-0-quality-review.md) (superseded) |
| Phase 1 | [implementation/phase-1-report.md](implementation/phase-1-report.md) · [phase-1-audit.md](implementation/phase-1-audit.md) · [implementation-decisions.md](implementation/implementation-decisions.md) · [test-results.md](implementation/test-results.md) · [visual-qa.md](implementation/visual-qa.md) · [known-limitations.md](implementation/known-limitations.md) · [architecture/api.md](architecture/api.md) |

## Key decisions so far
1. 7-item navigation (Home, Stakeholders, Initiatives, Engagements, Decisions, Commitments, Reports). Organizations merged into Stakeholders; the Map is a view mode; there is no separate "Intelligence" section.
2. PostgreSQL only (RLS, pgvector, pg_trgm). No graph database until a measured trigger is hit.
3. Cytoscape.js (fCoSE + ELK) for the relationship map; React Flow for small editable diagrams.
4. AI writes only suggestions; every claim is cited and labelled fact or inference; retrieval is permission-aware.
5. Light-first, cool-neutral UI with a single teal accent. Violet is reserved for AI. Inter for UI, Newsreader for narrative text.

## Open items
- The source brief was truncated partway through §8 ("Establish eva…"). Evaluation was covered in the AI doc; any later sections (9+) have not been received.
- `morluto/rea` is not installed.
- No Figma file has been designated yet.
- Not a git repository yet.
