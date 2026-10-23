# Known Limitations (Phase 2, AI layer)

## Unverified
| Area | Status |
|---|---|
| **Claude engine** | Never run against the live API, because no credentials were available. It typechecks against SDK 1.2.0, and its guard path is exercised by a scripted test double. Model quality, latency and cost are **unmeasured**: run `npm run eval` with a key before relying on it. |
| Provider data terms | Not reviewed in this phase. This is required before any real customer data reaches a model (`security-and-privacy.md`). |
| Real PostgreSQL | As in Phase 1, everything ran on PGlite. The AI tables and policies are standard SQL. |
| Browsers | Visual QA was done in Chrome only (desktop 1440 px, mobile 375–390 px). No Safari or Firefox pass, and no manual screen-reader pass. Axe reports 0 violations on 60 views, including 8 AI views. |

## Quality limits of the built-in rules engine (measured)
- **Held-out recall:** decisions 50%, obligations 66.7%, both at 100% precision (`evaluation-results.md`). It misses `ACTION: Name to …` lines, "(owner: X)" bullets, "Agreed: …" headers, unassigned asks ("would like a paper") and "will not be extending" decisions.
- **Email signatures:** "I'll …" in an email gets no owner, because the signature isn't read.
- **Copilot without a key:** answers about ten question patterns. Anything else gets a list of supported questions.
- **Briefings without a key:** facts, metrics and rules only, with no interpretation. Concerns are found by keyword-matching engagement text.

## Product gaps
- **Model routing:** `AI_MODEL` is global. There's no per-feature model choice, and with a key, deterministic copilot questions still go to the model; they could be routed to the rules engine for free.
- **Merge:** links a proposal to another *pending proposal* only. A duplicate of an existing record is shown with a link and can be rejected; merging into an existing record isn't implemented.
- **Proposal kinds:** `stakeholder_note` and `follow_up_engagement` exist in the schema but can't be accepted yet. Extraction doesn't produce them today.
- **Notes size limits:** stored notes are capped at 50,000 characters and analysis at 60,000. Transcript upload enforces 50,000.
- **Uploads:** only `.txt`, `.md`, `.vtt` and `.srt`. No audio transcription, no PDF/DOCX, no email or calendar import.
- **Injection detection:** heuristic patterns. The structural controls hold regardless: verbatim quotes, no write tools, human approval and RLS.
- **Rate limiter:** in-memory, so limits apply per process. A multi-instance deployment needs a shared store.
- **Copilot tooltips:** citation tooltips on the first visible line can be clipped by the panel edge.
- **Analysis history:** only the latest analysis per engagement is shown. Earlier analyses are kept in the table but not browsable.
- **Briefing cache:** 15 minutes per user. A briefing can trail a change made in that window, unless the change alters the evidence hash or the user presses Regenerate.
