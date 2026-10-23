# Environment Capability Report

_Inspected 2026-10-22. Working directory: `~/Desktop/Stakeholder Management`._

## Repository state

| Item | Finding |
|---|---|
| Existing files | **None.** The directory was empty — no code, dependencies, design system, or prior architectural decisions to preserve. |
| Version control | **Not a git repository.** Recommend `git init` before any code is written so foundation docs are versioned. |
| Runtime | Node.js v24.21.0, npm 11.19, npx, corepack (pnpm available via corepack, not activated). Python 3 (system). |
| Missing CLIs | `gh` (GitHub CLI), `pnpm`, `bun`, `rea` |

Nothing was installed, and no unknown scripts were run during this inspection.

## Capability matrix

| Capability | Status | Notes | Recommended use |
|---|---|---|---|
| **`morluto/rea`** | **Missing** | No `rea` binary on PATH, no matching skill, plugin, MCP server, or global npm package. | Not used. Competitive research relied on public web pages (search + fetch). If wanted, install it after reviewing its source and licence, then re-run a targeted interaction study of Attio, Linear and Kumu's public surfaces. |
| Web search / fetch | Available | WebSearch, WebFetch | Competitive research, library benchmarks, standards references. |
| Built-in browser pane | Available | Navigate, screenshot, accessibility tree, console/network | Visual QA of the prototype; public product-page observation. |
| Claude in Chrome | Available (extension) | User's real Chrome | Only if the user wants authenticated observation of their own trial accounts — never to bypass access controls. |
| Figma (official MCP) | Available, needs a file | `create_new_file`, `use_figma`, `get_design_context`, Code Connect | Translate `docs/design/design-system.md` tokens into a Figma variables library once a Figma file/team is chosen. |
| Figma Console MCP | Available | Variables, components, design-system audit, screenshots | Batch token creation (`figma_setup_design_tokens`), component audits. Requires the Figma desktop plugin bridge running. |
| Motion MCP (`motion`) | Available | Motion docs search | Reference when implementing panel/graph transitions in React (`motion/react`). |
| Motion+ MCP | Requires configuration | Needs OAuth via `/mcp` | Optional; paid examples only. |
| Data plugins (Amplitude, Atlassian, BigQuery, Hex) | Requires configuration | Need OAuth | Not needed for the foundation phase. |
| Definite data plugin | Failed to connect | Endpoint error | Not needed. |
| Unity, Blender MCP | Available | Irrelevant to this product | Do not use. |
| Asana, Slack, Claude Docs connectors | Available | — | Optional later: publish strategy docs or a roadmap for team review. |
| Skills — frontend | Available | `react-best-practices`, `how-to-write-component`, `tailwind-v4`, `frontend-testing`, `e2e-testing`, `qa`, `accessibility` | Use when the application scaffold begins (Prompt 1+). |
| Skills — design/motion | Available | `artifact-design`, `ui-motion`, `motion-design`, `figma`, `figma-spec`, `apple-design` | Design-system implementation and motion polish. |
| Skills — AI | Available | `claude-api`, `agent-security-hardening`, `agent-eval`, `ai-regression-testing` | AI intelligence layer implementation and evals. |
| Skills — architecture | Available | `architecture-decision-records`, `api-design`, `backend-patterns`, `security-review` | Record ADRs; API and security reviews. |
| Agents | Available | `general-purpose`, `Explore`, `Plan`, `motion-reviewer` | Parallel research; motion performance audits. |
| Playwright / Vitest | Missing (not installed) | Install per project once scaffolded | E2E and unit testing. |

## Recommendations before Prompt 1 (build)

1. `git init` and commit `docs/` as the baseline.
2. Decide the Figma destination (new file vs. team library) before token sync.
3. Decide whether to install `morluto/rea`; review its source and terms first.
4. Activate pnpm via `corepack enable` when scaffolding the monorepo.
