# Creative Director's Audit (Phase 6)

**Evidence:** `screenshots/baseline/` (58 captures: 16 screens plus states, desktop 1440 and mobile 390) and `screenshots/cycle1/` (after the fixes). Every finding below was observed in a screenshot or reproduced in the browser.

## Does the product have a distinctive identity?
**Yes. It is restrained and specific rather than decorative.** The identity rests on four consistent decisions:

| Element | Where | Assessment |
|---|---|---|
| **Two voices of type** | Inter for UI. A serif for narrative evidence (briefings, meeting notes, quoted source text) | The strongest signature: the reader can tell at a glance what is *recorded* versus *interface*. Keep |
| **Monospace record keys as first-class citizens** | `C-176`, `D-110`, `E-3936`, initiative codes `EDR`/`HFD` as chips | Gives the product its "intelligence ledger" character, and makes every record citable in conversation. Keep |
| **Citations everywhere** | Numbered chips after every briefing and copilot claim, each linking to a record | The visual expression of "evidence-backed". Rare in the category |
| **Calm surfaces** | One teal accent, slate neutrals, hairline borders, almost no shadow, no gradients | Avoids the generic "AI SaaS" look (purple gradients, glassy cards) |

**Generic-pattern check:**
- **None found:**
  - random card assemblies
  - arbitrary gradients
  - oversized headings
  - decorative analytics without an action
  - unrelated icon sets (one icon family, Lucide, at consistent sizes)
- **Charts are actionable:**
  - the Command Center's stance bar links to filtered lists;
  - the commitment horizon is hover-inspect and click-to-open;
  - initiative coverage links to the initiative.
- **Copilot:** not a generic chatbot. Answers are structured (record cards, sources, follow-ups) and it states its engine and limits.

## Findings
**Severity:**
- **P1:** hurts comprehension or trust.
- **P2:** visible polish or consistency defect.
- **P3:** refinement.

| # | Finding | Evidence | Sev | Status |
|---|---|---|---|---|
| C1 | **Command Center led with the wrong thing.** The workspace briefing took about 370 px (desktop) and the whole first phone screen: four "Metric / How this is counted" blocks repeating the greeting's sentence. "Needs attention", the actionable list, started below the fold | `baseline/desktop-01`, `mobile-01` | P1 | **Fixed**: kind stated once per section, method as an inline "How?" disclosure, engine note in the header. Briefing 370→187 px; attention list starts at 355 px instead of 535 px; phone shows 6 actionable rows instead of 1½ (`cycle1/…-01`) |
| C2 | **Same record, two numbers.** Copilot said C-137 was "7 days overdue"; Commitments and the Command Center said 8. Server surfaces each rounded time differences their own way | `baseline/desktop-10-copilot` vs `desktop-09` | P1 (trust) | **Fixed**: one calendar-day helper (`shared/dates.ts`) for signals, briefings and copilot, with a unit test at four times of day. Copilot now reads 8 (`cycle1/desktop-10`) |
| C3 | **Universe overview illegible.** 86 overlapping 6 px labels at the default 61% fit | `baseline/desktop-04` | P1 | **Improved**: labels scale with influence (9–12 px); at overview zoom only influence 3–4 are named; selection, neighbours, search matches and paths always keep labels. ~30 names instead of 86 (`cycle1/desktop-04`). *Remaining:* named labels still render ~7 px at 61% (P2) |
| C4 | **Misleading error copy.** A failed *load* said "Your changes have not been saved yet" | `baseline/desktop-state-error-directory` | P2 | **Fixed**: reads say "Couldn’t reach Meridian. Check your connection, then try again."; writes keep the unsaved-changes warning |
| C5 | **Counts that read wrong.** "26  Archived" / "184  Archived" read as "26 archived" | `baseline/desktop-05`, `desktop-02` | P2 | **Fixed**: "26 organizations" + "Show archived", using the workspace vocabulary (templates rename record types) |
| C6 | Copilot listed all 18 sources, pushing the answer itself out of view | `baseline/desktop-10` | P2 | **Fixed**: first 5 plus "Show all 18 sources"; citation numbers unchanged |
| C7 | Phone breadcrumb truncated to "Stakeholders / We / B" | `baseline/mobile-03` | P2 | **Fixed**: phones show the nearest parent as a back link ("‹ Westshire County Council"); checked on 8 screens |
| C8 | Phone profile left a separator dangling at a line end ("Head of Highways ·") | `baseline/mobile-03` | P2 | **Fixed**: role, organization and location stack on phones |
| C9 | A cross-file CSS leak hid the Home briefing's engine disclosure on phones (`profile.css` rule unscoped) | Found while verifying C1 | P2 (transparency) | **Fixed**: profile rules scoped to `.prof` |
| C10 | Two "more" controls in one panel aligned differently | `cycle1` copilot | P3 | **Fixed** |
| C11 | Organizations: "Classifications" column is "—" on every row of the sample data | `baseline/desktop-05` | P3 | Open: hide empty optional columns, or keep for discoverability (product decision) |
| C12 | Meeting Intelligence: the "Analysed by…" meta line wraps mid-name at desktop widths | `baseline/desktop-11` | P3 | Open |
| C13 | Settings tab strip on phones shows the group label "Workspace" inline between tabs | `p5/crumb-settings` | P3 | Open |
| C14 | Closed-signup message says "contact us" without a link (Phase 5) | Phase 5 capture | P3 | Open |

## What should not change
- **Density:** Engagements, Decisions and Commitments are dense, aligned tables with tabular numerals, inline status and relative dates. That density is correct for daily work; adding cards would make them worse.
- **The Profile's composition:** identity block with meta column, a "Needs attention" strip, tabs, evidence-cited briefing, ego network and open commitments. It already reads as an intelligence workspace rather than a contact form.
- **Empty states:** they explain what the screen will show and offer the next action (`baseline/desktop-state-empty-command-center`).

## Overall
- **Before:** visually coherent and distinctive, but the Command Center's first screen prioritised narrative over action; one number disagreed across surfaces; the Universe overview was cluttered.
- **After:** those three are addressed. The weakest remaining area is the **Universe at scale and at overview zoom**: legibility and the 2,000-person ceiling (`performance-report.md`).
