> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# How Meridian's AI features handle your data (draft)

## The short version
- AI features run on a **built-in rules engine by default. With the rules engine, no data leaves Meridian's servers.**
- A large language model ([MODEL PROVIDER] — Anthropic's Claude is the only one supported) is used **only if [LEGAL ENTITY NAME] enables it** for the environment your workspace runs in. Every AI response is labelled with the engine that produced it.
- The model only ever sees records **you are allowed to see**.
- AI output is a **suggestion**. Nothing is added to your workspace until a person accepts it.

> BUSINESS: State here whether the model is enabled for [ENVIRONMENT / PLAN]: [ENABLED / NOT ENABLED]. Do not enable it on real customer data until the provider's data terms are reviewed.

## What the AI features are
| Feature | What it does | Plans |
|---|---|---|
| Meeting intelligence | Proposes decisions, commitments and actions from meeting notes or transcripts (.txt, .md, .vtt, .srt). Every proposal is tied to a verbatim quote from the source | Professional, Enterprise |
| Briefings | Stakeholder, decision and workspace briefings: facts and metrics (with how they were computed) and rule-based recommendations; with a model, also cited interpretation | All plans |
| Copilot (⌘J) | Answers questions from records you can access, with numbered citations | All plans |

Command Center signals and relationship paths are deterministic rules, not AI models.

## What is sent to the model provider (only when a model is enabled)
| Feature | Sent |
|---|---|
| Meeting intelligence | The engagement's notes or transcript (up to 60,000 characters), its participants, workspace member names and known stakeholder names |
| Briefings | The facts and evidence gathered for that briefing from records you can access |
| Copilot | Your question, up to the last 8 messages of your conversation, and the results of read-only lookups over records you can access |

How it's protected:
- Retrieval runs under your own access rights (database row-level security). Other workspaces' data and restricted stakeholders you can't see are never included.
- Imported text is fenced and treated as data, not instructions. Instruction-like lines are flagged to you and nothing is extracted from them. (Detection is heuristic; the protections below apply regardless.)
- The model has no ability to write. Quotes must match the source verbatim and citations must point to real records, or the item is dropped.

## What Meridian stores
| Data | Stored? |
|---|---|
| AI usage records | Yes: feature, engine, model, token counts, cost, latency and status. **Never prompts or answers** |
| Copilot conversations | Only if your workspace keeps them: retention is set by an admin (default 30 days; 0 = never stored). You can delete your conversations at any time |
| Briefing cache | 15 minutes per user, model briefings only |
| Meeting analyses and proposals | Yes — they are business records kept with the engagement, and deleted with it |
| Audit entries for AI actions | Counts and ids only, never note text |
| Request logs | No request bodies, so no prompts or answers |

## What the model provider does with data
**Review [MODEL PROVIDER] terms; do not state training/retention commitments until confirmed.** Meridian cannot verify provider-side retention from inside the application.

> COUNSEL: Once reviewed, state the provider's retention period, training position, processing region and any zero-data-retention arrangement here, citing the agreement.

## Human approval
- Meeting proposals must be accepted, edited, rejected or merged by a person. Accepting re-checks that person's permissions for the record type (e.g. a Contributor cannot record a decision as decided).
- Copilot and briefings are read-only.

## Limitations
- AI output may be incomplete or wrong; review it before relying on it.
- The rules engine is deliberately conservative and misses some phrasings; without a model, copilot answers about ten question patterns and briefings show facts, metrics and rules without interpretation.
- Model quality has not yet been measured against the live model. No accuracy figures are claimed.
- No audio transcription; text files only.
- AI is unavailable while a workspace is read-only, and model features stop when the monthly allowance is reached (no overage charges).

## Questions
[PRIVACY CONTACT EMAIL]
