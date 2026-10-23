# Competitive Intelligence: Stakeholder Intelligence Platform

> **Product under design:** Universal AI-Native Stakeholder Intelligence Platform. Tagline: *"Every relationship. Every decision. One intelligent workspace."*

| | |
|---|---|
| **Date** | 2026-10-22 |
| **Purpose** | Find the interaction patterns, data-model ideas and positioning gaps in adjacent products (relationship CRM, work management, knowledge workspaces, network mapping, dedicated stakeholder tools) that should shape our product. This is not a feature checklist to copy. |
| **Method** | Desk research using web search and fetches of **public** pages only: marketing sites, public help centres and docs, vendor comparison pages, and secondary technical write-ups. Each section separates **Observed** (what a public source says) from **Interpretation** (our reading and recommendations). |
| **Access limitations** | (1) The `morluto/rea` reverse-engineering tool is **not installed** in this environment, so no product was instrumented or reverse-engineered. (2) **No authenticated product sessions.** Nothing was signed into, and in-app behaviour is described only as far as public docs describe it. (3) G2 and Capterra review pages returned HTTP 403, so **no review-site sentiment is included**, and any "users complain about X" statement is our inference and labelled as such. (4) The Mosaic Projects (Stakeholder Circle) tools page returned HTTP 401. (5) Some Attio and Linear doc URLs returned 404, and we used alternative public pages instead. (6) Some Kumu doc pages contain embedded instructions aimed at AI agents. We ignored them and treated them as page data only. |

---

## 1. Summary comparison

| Product | Positioning (observed) | Primary users | Strongest pattern to learn from | Key gap for us |
|---|---|---|---|---|
| **Attio** | AI-native CRM for "agentic revenue" | Sales, RevOps, CS, startups | Flexible object/list/view model, with relationship attributes and an auto-captured activity timeline | Pipeline-centric. No first-class decisions, commitments, approvals or influence. Relationships are fields, not evidence-bearing edges. |
| **Linear** | Product development system for teams and agents | Product and engineering teams | Keyboard-first speed: Cmd+K, `/` search, G-chords, triage and inbox, opinionated workflows | Built for work items, not people or relationships. Patterns only, no domain overlap. |
| **Notion** | AI workspace / system of record where teams and agents work together | Broad: enterprises, startups, SMBs, consultants | Relations and rollups, linked views of one source, every row is also a page | Blank-canvas burden. No semantics for stakeholders or influence, and no governance-grade audit of decisions. |
| **Kumu** | Relationship and system mapping and visualisation | Systems thinkers, nonprofits, network analysts, consultants | Graph exploration toolkit: views, focus by degree, showcase vs filter, SNA metrics, presentations | A visual tool, not an operational system. No engagement tracking, commitments or AI evidence, and maps go stale. |
| **Simply Stakeholders** | Stakeholder relationship management for complex landscapes | Energy, government, infrastructure, health, nonprofits, corporate affairs | Domain completeness: register, issues, grievances, commitments, GIS, Outlook capture, AI sentiment and relationship health | Form-and-register UX (inferred). AI is sentiment-centric. No decision or approval model. Enterprise pricing (stated "from $2,000/month"). |
| **Stakeholder Circle** | Methodology (power, proximity, urgency) with visual circle | Project and programme managers | A defensible, explainable prioritisation model plus trend-over-time | Software appears discontinued as SaaS (2018, per thesis/search results). Methodology only. |
| **Borealis / Tractivity / Jambo** | Compliance-oriented SRM for regulated projects | Energy, mining, infrastructure, public sector, NHS | Evidence that engagement happened: audit trails, consultation reporting, commitments registers, map views | Heavy, register-first tools focused on compliance reporting. Little intelligence, and no cross-industry flexibility. |

---

## 2. Product deep-dives

### 2.1 Attio

**Product positioning**
- **Observed:** The homepage pitches a CRM for "agentic revenue", with AI agents that prospect, enrich, score and draft outreach while humans approve and close. Its structure is organised around revenue stages (build pipeline, convert leads, run sales motions, forecast, retain and expand).
- **Interpretation:** Attio has moved from "flexible CRM" towards an AI revenue engine. Its gravity is the deal, not the relationship as a whole. That leaves the non-revenue relationship space (regulators, communities, boards, partners, internal sponsors) largely uncontested by modern tools.

**Primary users**
- **Observed:** Sales reps and AEs, revenue leaders and CROs, customer success, RevOps, and startups (it runs a startup programme).

**Core capabilities**
- **Observed:**
  - Standard objects: Companies, People, Deals, Users and Workspaces.
  - Custom objects require Pro or Enterprise, and only admins can create them.
  - **Relationship attributes** come as a pair, one on each side, and support one-to-one, one-to-many or many-to-many links, either within an object or across objects. Fields from a linked record can be displayed, filtered and sorted on (Pro or Enterprise).
  - **Lists** are separate from objects. A list entry is a record plus list-specific attributes, such as an RSVP status, and lists can carry their own permissions.
  - **Views** are saved table or Kanban displays whose membership updates automatically as data changes.
  - Auto-enrichment.
  - Email and calendar sync that links emails to people by address and to companies by domain.
  - Call intelligence: recordings, transcripts and summaries.
  - "Ask Attio": natural-language questions over records.
  - Trigger-based workflows with agent steps.
  - MCP, an API and an SDK.
- **Observed (help centre):**
  - The record page has tabs: Overview, Activity, Emails, Files and Notes.
  - The Activity tab aggregates calendar events, manual activities, notes, attribute updates and list changes.
  - A 2026 release note (seen via a third-party aggregator) mentions activity filters by event type, remembered per object.

**Navigation model**
- **Observed:**
  - **Sidebar:** Home, search, a notifications inbox, Tasks, Notes, Emails, Calls, Reports, Sequences, Workflows, Favorites (personal and foldered), Records (Companies, People, …), Lists, and Ask Attio chats.
  - **Cmd/Ctrl+K:** context-aware quick actions.
  - **`/`:** search across name, email, domain, phone, ID and some text fields.
  - **Single-key shortcuts:** `n` for a note, `t` for a task, `c` for an email, `?` for help. Typing a prompt and pressing Tab starts an Ask Attio chat.
  - Over 30 quick actions, per the help centre.

**UX strengths**
- **Interpretation:**
  - The help centre's guidance on choosing between an attribute, a view, a list and an object is unusually clear. It teaches users the data model rather than hiding it.
  - The list-entry concept (the same person with different context in different processes) is a strong fit for stakeholders: one person can be a "champion" in Programme A and a "blocker" in Programme B.
  - Passive capture from email and calendar cuts data-entry burden, which is the main killer of stakeholder tools.

**UX weaknesses**
- **Interpretation (not verified with users, since review sites were inaccessible):**
  - Flexibility shifts modelling work onto admins, and the relationship features most relevant to us are gated to higher tiers.
  - Relationships are typed pointers with no strength, direction-of-influence, time validity or evidence attached.
  - The activity timeline is a log, not a reasoned narrative ("what changed and why it matters").

**Relevant interaction patterns**
- Context-aware Cmd+K.
- Prompt-then-Tab to hand off to AI chat.
- Personal favourites in folders.
- A record page with a tabbed activity timeline and filters remembered per object.
- List-specific attributes.
- Bidirectional relationship attributes with "lookup through" filtering.

**Opportunities for differentiation**
- **Interpretation:**
  - Make relationships first-class edges with type, direction, strength, confidence, valid-from/to dates and linked evidence.
  - Add Decisions, Commitments and Approvals as native objects, which Attio's standard model lacks.
  - Offer "context per engagement" (like list entries) without requiring an admin to model it.

**Evidence and sources**
- https://attio.com/
- https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views
- https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace.md
- https://attio.com/help/reference/managing-your-data/objects (index only)
- Search snippets for https://attio.com/help/reference/managing-your-data/attributes/relationship-attributes and https://attio.com/help/reference/managing-your-data/records/create-and-view-records.md
- https://releasebot.io/updates/attio (third-party aggregator, seen via search only)
- https://attio.com/help/reference/managing-your-data/objects/custom-objects returned 404.

**Confidence: Medium-High.** The data model and navigation come from official help pages. AI and agent claims are marketing copy. No review-site data was available.

---

### 2.2 Linear

**Product positioning**
- **Observed:** Describes itself as a product development system shared by teams and AI agents. It claims over 40,000 product teams. It now includes intake, planning (initiatives, roadmaps, PRDs), agents that can own issues end-to-end, code review, a priority inbox and recurring agent "loops". The homepage has a section on speed but publishes no benchmarks.

**Primary users**
- **Observed:** Product and engineering teams, from startups to large enterprises.

**Core capabilities**
- **Observed (conceptual-model doc):**
  - Workspace contains Teams, which can be nested.
  - Teams own workflows, triage, cycles, labels and issues.
  - Issues are the atomic unit of work.
  - Projects (with milestones) group issues, and Initiatives sit above projects.
  - Cycles are recurring planning periods.
  - Views are lenses that never change the underlying work.
  - Triage is the explicit review step for new work.

**Navigation model**
- **Observed:**
  - **Sidebar:** Inbox, My Issues, Workspace (views, projects, initiatives), Your teams and Favorites.
  - **Cmd/Ctrl+K:** opens a command menu to run any action or jump to any page.
  - **`/`:** search, including by issue ID such as LIN-123.
  - **Two-key "G" chords:** G then I for Inbox, G then M for My Issues.
  - **`?`:** lists all shortcuts.
  - **Cmd-click:** opens in a new tab.
  - Third-party guides also cite Space for peek and C to create, which is plausible but not verified on Linear's own pages.
- **Observed (secondary sources only):** Linear's perceived speed is widely attributed to a local-first sync engine: reads from a local store, optimistic mutations and background reconciliation. One write-up quotes a co-founder saying the sync engine was the first code he wrote. The exact implementation details are **not confirmed** by primary sources we accessed.

**UX strengths**
- **Interpretation:**
  - It feels instant (optimistic UI).
  - Every action is reachable from the keyboard.
  - It is opinionated, so there are few configuration decisions.
  - "Views don't change the work" is a clean mental model.
  - Triage plus Inbox create a clear "what needs my attention" surface.
  - Density works because typography, spacing and iconography are consistent.

**UX weaknesses**
- **Interpretation:** Opinionation limits fit outside software teams. Shortcut-heavy UX has a learning curve for occasional users, for example the executives and field officers who will use our product. Discoverability depends on `?` and Cmd+K.

**Relevant interaction patterns**
- A universal command menu.
- `/` search with ID addressing.
- G-chords for navigation.
- A peek preview (inferred from third-party sources).
- A triage queue for new inbound items.
- An Inbox that separates "needs attention" from "FYI".
- Views as non-destructive lenses.
- Human-readable IDs (LIN-123).

**Opportunities for differentiation**
- **Interpretation:**
  - Bring Linear-grade speed and keyboard affordances to a relationship domain where tools are typically slow and form-heavy.
  - Apply triage to *inbound signals* (an email that implies a new commitment, or a meeting note that implies a decision) rather than to tickets.
  - Give human-readable IDs to decisions and commitments (DEC-142, COM-88) so they can be cited in meetings and board papers.

**Evidence and sources**
- https://linear.app/
- https://linear.app/docs/conceptual-model
- https://linear.app/enablement/guide/navigating-linear
- https://linear.app/method (table of contents only)
- Search results for secondary write-ups: https://dev.to/0xgosu/why-linear-feels-fast-local-data-small-updates-and-product-discipline-1m53, https://hungrymindsdev.substack.com/p/why-linear-feels-so-fast-technical, https://braindetox.kr/en/posts/linear_local_first_speed_2026.html
- https://linear.app/docs/keyboard-shortcuts returned 404.

**Confidence: Medium-High** for the navigation and conceptual model, which come from official docs. **Low-Medium** for the sync-engine specifics, which come from secondary sources only.

---

### 2.3 Notion

**Product positioning**
- **Observed:** Describes itself as an AI workspace where teams and agents work together, framed around capturing context, finding answers (AI with citations) and automating with agents. The product page claims 62% of the Fortune 100 and over 50% of YC companies as users.

**Primary users**
- **Observed:** Enterprises, startups, small businesses, developers and consultants (there is a consultants listing and a template marketplace).

**Core capabilities**
- **Observed (help centre):**
  - **Databases:** every item is a page that can hold rich content.
  - **Views:** multiple views per database, each with its own layout (table, list, board, calendar and gallery are documented on the page we read), filters, sorts, grouping and visible properties.
  - **Property visibility:** each property can be set to always show, hide when empty, or always hide.
  - **Peek:** items open in a peek preview before expanding to full page.
  - **Database lock:** freezes the schema while data stays editable.
  - **Templates:** new databases can start from a template, an existing source, or an AI prompt.
  - **Relations:** one-way by default. A two-way option mirrors the property, and self-relations are supported.
  - **Rollups:** count, unique, percent empty, sum, average, median, min, max, range, earliest/latest date and date range.
  - **Rollup and relation limits:** you can't roll up a rollup. CSV export flattens relations to URLs. Duplicating a database turns two-way relations into one-way.
  - **Linked databases:** filtered and sorted views of a single source embedded anywhere. Edits write back to the source.
- **Not verified this session:** timeline, chart, form and map layouts, and database automations. These are widely reported but were not on the pages we fetched.

**Navigation model**
- **Observed:** A sidebar page tree, where full-page databases appear in the sidebar and inline databases live inside pages. Peek, then expand. Backlinks and comments on pages.
- **Interpretation:** Hierarchy is user-authored, so navigation quality depends on the workspace author.

**UX strengths**
- **Interpretation:**
  - "Row is a page" lets structured fields and narrative context live together, which is ideal for a stakeholder profile or a decision record.
  - Linked views let one canonical dataset appear in many contexts (a meeting note, a project page, a personal dashboard) without duplication.
  - Rollups give lightweight computed intelligence.

**UX weaknesses**
- **Interpretation:**
  - Blank-canvas cost: every team must design its own schema, and quality varies.
  - Relation and rollup semantics are generic, with no notion of influence, sentiment or time validity.
  - Weak integrity: you can't roll up a rollup, exports lose relations, and duplication breaks two-way links.
  - Audit and governance are not decision-grade for regulated sectors (inference, not verified).

**Relevant interaction patterns**
- Row-as-page.
- Peek preview with expand.
- Per-property visibility rules.
- Linked views embedded in documents.
- Schema lock.
- `/`-commands to insert blocks.
- AI-generated database from a prompt.
- Templates per database.

**Opportunities for differentiation**
- **Interpretation:**
  - Ship an opinionated universal core schema (Stakeholder, Organisation, Relationship, Engagement, Issue, Decision, Commitment, Approval, Evidence) with Notion-like flexibility at the edges (custom fields, industry templates).
  - Make "linked views" a first-class embed in meeting notes and briefing packs. For example, "stakeholders affected by DEC-142" could be live inside a board paper.

**Evidence and sources**
- https://www.notion.com/product
- https://www.notion.com/help/intro-to-databases
- https://www.notion.com/help/relations-and-rollups
- https://www.notion.com/help/guides/using-linked-databases

**Confidence: Medium-High** for databases, relations, rollups and linked views (official help pages). **Medium** for positioning claims (marketing figures). **Low** for anything about automations and extra layouts (not verified).

---

### 2.4 Kumu

**Product positioning**
- **Observed:** A platform for mapping relationships and systems. Its docs have discipline guides for system mapping and social network analysis (SNA) and network mapping. Public projects are free and indexed by search engines. Private projects are paid (stated at $9/month per project in a basic workspace and $20/month per project in a pro workspace). Pro workspaces cost $10/month, and Enterprise is quote-based with self-hosted and air-gap options.

**Primary users**
- **Interpretation (from docs and pricing):** Systems-change practitioners, nonprofits and community groups (there is a discounted community pricing scheme), network weavers, consultants, students and researchers.

**Core capabilities**
- **Observed:**
  - **Three primitives:**
    - **Elements** (nodes).
    - **Connections** (edges): can be directed, curved, collapsed when duplicated, and even branch from other connections.
    - **Loops:** labelled groups of two or more connections, used for causal loops, sub-systems and communities. They can be auto-detected and ranked by length.
  - **Fields**, including computed fields.
  - **Views:** a saved bundle of decorations, filters and settings. Many views can exist, and one view can apply to multiple maps. A map holds the elements, connections and positions, so data and presentation are separate.
  - **Decorations:** direct or data-driven size, colour, flags, icons, images, label templates and popovers.
  - **Filter vs Showcase:** filter hides unselected items. Showcase fades them to translucent. Showcase has normal, loose and strict modes, with configurable foreground and background opacity.
  - **Focus:**
    - Click and hold to isolate an item, then expand or contract by degree with `+` and `-` or number keys. `Esc` resets.
    - Focus can be predefined per view, for example a selector such as "high influence, out 2".
    - Focus direction can be set to in, out or all.
    - **Prompted mode** starts with a search box instead of the full map, and the user adds people ("Name out 3").
  - **SNA metrics:** degree, closeness, betweenness and eigenvector, written back to fields and usable in decorations.
  - **Clustering** turns profile data into connections.
  - **Presentations** walk readers through views.
  - **Advanced Editor:** a CSS-like selector language.
- **Observed (SNA guide):** The guide warns about "hairball" maps (with a layout preset for them), about convenient data that doesn't reflect meaningful relationships, and about readers unfamiliar with network maps.

**Navigation model**
- **Observed:** A map canvas with a view dropdown at the top right, a side panel with profiles and overviews, a Basic Editor and an Advanced Editor, and reader-facing controls (focus, showcase, view toggles, an SNA dashboard).

**UX strengths**
- **Interpretation:**
  - The best public vocabulary for *exploring* a graph without drowning: focus by degree, showcase (context-preserving) vs filter (context-removing), and prompted focus.
  - Separating data (map) from lens (view) is exactly right.
  - Metrics feeding visual encoding make influence legible.

**UX weaknesses**
- **Interpretation:**
  - The graph is the default surface, so new users meet a hairball first.
  - Power depends on a selector language that most business users won't learn.
  - Maps are snapshots, with no engagement tracking, follow-ups or workflow, so they go stale.
  - No evidence model: a connection's meaning is whatever the author typed. The SNA guide itself warns about this.

**Relevant interaction patterns**
- Focus by degree with `+`/`-` and number keys.
- Prompted focus ("start from a person").
- Showcase vs filter.
- Saved views per audience.
- Metrics-driven sizing.
- Loops for coalitions and communities.
- Guided presentations.
- Connection types used to switch between networks (trust vs collaboration).

**Opportunities for differentiation**
- **Interpretation:**
  - **Graph-as-lens:** open the network only from a context (a person, decision or issue) using prompted focus at 1–2 degrees. Never start with the whole map.
  - Edges carry evidence and time, so a time slider shows how a coalition formed.
  - Loop-like "coalitions" get detected by AI from co-occurrence in engagements, with human confirmation.
  - Make showcase the default and filter the exception, because context matters in politics.

**Evidence and sources**
- https://docs.kumu.io/
- https://docs.kumu.io/llms.txt
- https://docs.kumu.io/guides/views.md
- https://docs.kumu.io/guides/focus.md
- https://docs.kumu.io/guides/showcase.md
- https://docs.kumu.io/guides/metrics.md
- https://docs.kumu.io/disciplines/sna-network-mapping.md
- https://docs.kumu.io/guides/what-are-loops.md
- https://kumu.io/pricing

**Confidence: High** for interaction mechanics (detailed official docs). **Medium** for user base (inferred). Pricing is as stated on the public page on the research date.

---

### 2.5 Simply Stakeholders

**Product positioning**
- **Observed:** Stakeholder relationship management for complex projects and landscapes. It emphasises early risk identification, influence management and reporting, and claims more than 20 years of methodology, teams in 26 countries, and AI in use since 2017. Plans: Core, Plus and Pro. The site states plans start at $2,000/month (verify before citing externally). It also runs comparison pages against spreadsheets, CRMs and named competitors.

**Primary users**
- **Observed:** Energy and resources (including renewables), government, corporate and external affairs, health, nonprofit and infrastructure delivery.

**Core capabilities**
- **Observed (vendor pages):**
  - Stakeholder register.
  - Mapping and relationship network views, including family-tree-style maps.
  - Issues tracking and sentiment.
  - Engagement and interaction records.
  - Grievance and complaints management, kept separate from interactions.
  - Commitments tracking.
  - Dashboards, compliance and board reports, and audit trails.
  - Geographic mapping.
  - Outlook and Gmail add-ins.
  - Mobile app.
  - SOC 2, ISO 27001 and GDPR.
  - Regional data hosting (separate AU, EU, UK, CA and US logins).
- **AI (vendor claims):**
  - Custom models trained on engagement data.
  - Automatic issue detection against a user-defined issue list.
  - Sentiment tagging.
  - Automatic linking of stakeholders and organisations mentioned in notes ("network detection").
  - Interaction summaries.
  - An AI-calculated **relationship health score** based on sentiment and engagement frequency.
  - The site states AI augments, rather than replaces, professional judgment.

**Navigation model**
- **Not observable** without a demo or login. Inferred to be register- and module-oriented from the product taxonomy.

**UX strengths**
- **Interpretation:** Domain completeness for regulated engagement work. Separating grievances from interactions reflects real practice. Email add-ins attack data-entry burden. Regional hosting is a real buying criterion for government.

**UX weaknesses**
- **Interpretation (unverified):**
  - Likely module-and-form heavy.
  - AI is centred on sentiment and summaries, and does not appear to show *why* a score changed (no explicit evidence trail is described).
  - No decision or approval objects are described.
  - Pricing positions it out of reach for SMB consultancies and small nonprofits.

**Relevant interaction patterns**
- Capture from the inbox via add-in.
- A user-defined issue taxonomy that AI tags against.
- A relationship health score.
- A separate grievance channel.
- Regional tenancy selection at login.

**Opportunities for differentiation**
- **Interpretation:**
  - Make every AI score explainable: health score = f(sentiment, recency, commitments overdue…), with click-through to the exact interactions.
  - Add decisions and approvals, which compliance-oriented SRMs largely omit.
  - Offer a self-serve entry tier.

**Evidence and sources**
- https://simplystakeholders.com/
- Search results for https://simplystakeholders.com/platform/stakeholder-analysis, https://simplystakeholders.com/how-it-works/, https://help.simplystakeholders.com/article/relationship-health-score, https://simplystakeholders.com/borealis-alternatives/
- Capterra (https://www.capterra.com/p/180836/Simply-Stakeholders/) returned 403.

**Confidence: Medium.** Everything comes from the vendor and nothing is independently verified. Navigation and UX are unobserved.

---

### 2.6 Stakeholder Circle (Mosaic Project Services)

**Product positioning**
- **Observed (via search results and PMI paper abstract):**
  - A methodology from Lynda Bourne's doctoral research.
  - It weights stakeholders on **power, proximity and urgency/importance**, then combines them into a single circular diagram:
    - concentric rings show distance from the project
    - block size shows scale and scope of influence
    - radial depth shows the degree of impact
  - Tracking over time shows whether engagement strategies are working.
  - Software history: a FileMaker database (2006), cloud SaaS from 2012, discontinued in 2018 according to the thesis and search summaries. Word and Excel companions remain.

**Primary users:** Project and programme managers in PMI-style organisations.

**Core capabilities:** A prioritisation methodology, a visual "circle", and periodic re-assessment.

**Navigation model / UX:** Not observable. The tools page returned HTTP 401.

**UX strengths / weaknesses**
- **Interpretation:** Its strength is an *explainable* prioritisation model with named dimensions that executives accept. Its weakness is manual, periodic assessment that decays between workshops.

**Relevant patterns:** Multi-factor prioritisation with a visual summary, and trend tracking of assessments over time.

**Opportunities**
- **Interpretation:** Offer a configurable prioritisation model (power/interest, salience, or the Stakeholder Circle dimensions) as industry templates. Let AI *propose* re-assessments from new evidence, and humans confirm them.

**Evidence and sources**
- https://www.pmi.org/learning/library/project-relationships-stakeholder-circle-8092 (search result)
- https://mosaicprojects.com.au/PMKI-SHM-010.php (search result)
- https://mail.mosaicprojects.com.au/PDF_Papers/P021_L_Bourne_Thesis.pdf (search result)
- https://mosaicprojects.com.au/PMKI-SHM-030.php returned 401.

**Confidence: Low-Medium.** Based on search summaries, and the current status is unverified.

---

### 2.7 Other dedicated SRM tools (brief)

**Borealis (boreal-is.com)**
- **Observed:**
  - Positions itself as stakeholder software designed for large infrastructure and energy projects.
  - Modules: stakeholder engagement, issue and complaint management (with a grievance portal), land access and acquisition, and social investment.
  - Also: commitment tracking, Outlook/Gmail integration, a mobile app, analytics, and a US government officials database.
  - Industries: oil and gas, renewables, mining, utilities, transport and government.
  - The AI section exists, but the page we fetched did not describe it.
- **Interpretation:** Land and asset-linked stakeholders (parcel, owner, agreement) are a strong vertical template for construction and infrastructure.
- **Confidence: Medium (vendor page).**

**Tractivity (tractivity.co.uk)**
- **Observed:**
  - UK/EU SRM covering register, mapping by influence and interest, consultation (surveys, forms, events, the Engage-360 public portal), commitments (owner, deadline, status, risk, linked to stakeholders and locations), issues, sentiment and AI summarisation.
  - Over 150 pre-built reports, role-based multi-project access, ISO 27001 and NHS DSPT, hosted on Azure.
  - Stated price: SRM licence £9,495/year plus £500 per additional user. A comparison page states a different euro figure (from €10,995/year), so pricing varies by region and page.
  - Power BI integration timing is stated inconsistently on the page (both as upcoming and as a specific 2026 season).
- **Interpretation:** The public consultation portal and statutory reporting are table stakes for UK public-sector buyers.
- **Confidence: Medium.**

**Jambo (jambo.cloud)**
- **Observed:**
  - Positioned for teams that must *prove* they engaged.
  - Logs emails, meetings, calls and site visits. Issues are prioritised on a risk matrix, and commitments are tracked to fulfilment.
  - Consultation and compliance reporting.
  - Esri map viewers show engagement coverage and gaps, and it flags stakeholders not contacted recently.
  - "Jambo Secure AI" for sentiment trends, with a stated no-training-on-customer-data policy.
  - ISO 27001/27017.
- **Interpretation:** "Not contacted recently" plus geographic gap analysis is a simple, high-value attention signal. The no-training statement is a procurement must-have.
- **Confidence: Medium.**

**Darzin**
- Mentioned on competitor pages as a legacy/older platform (one vendor says its parent company is Darzin). Status unverified. Not researched further.

**Sources**
- https://www.boreal-is.com/
- https://www.tractivity.co.uk/
- https://jambo.cloud/
- Search results: https://www.tractivity.co.uk/comparison/jambo-alternatives, https://www.tractivity.co.uk/comparison/borealis-alternatives, https://www.boreal-is.com/borealis-alternative-to-darzin/
- These comparison pages are vendor-authored and treated as marketing.

---

## 3. Cross-cutting synthesis: what we can do fundamentally better

The market splits in two:
1. **Modern, fast, flexible horizontal tools** (Attio, Linear, Notion, Kumu) with no stakeholder semantics.
2. **Domain-complete but register-and-compliance-first SRMs** (Simply Stakeholders, Borealis, Tractivity, Jambo) with older interaction paradigms and AI focused mostly on sentiment.

Combining their features is not the opportunity. The opportunity is a different **core abstraction**: *relationships and decisions as evidence-backed, time-aware facts*, with a fast keyboard-first surface on top.

### 3.1 Evidence-linked intelligence (the trust layer)
- **Observed gap:** Competitors describe AI sentiment, summaries and health scores. None of the public material we read describes AI outputs traceable to source evidence at the claim level. Notion mentions citations for answers, but not for structured fields.
- **Recommendation:**
  - Every AI-derived fact (sentiment shift, inferred relationship, detected commitment, risk flag) carries **provenance**: source interaction(s), excerpt span, model and version, confidence, and a human confirmation state (suggested, confirmed or rejected).
  - Scores are decomposable on click.
  - This is our main differentiator for government, healthcare and infrastructure buyers, who must defend decisions.

### 3.2 Decisions, commitments and approvals as first-class objects
- **Observed gap:** CRMs model deals and activities. SRMs model commitments and issues, and some track grievances. No product reviewed models **Decisions** (who decided, options considered, stakeholders consulted, rationale, evidence) or **Approvals** (required approvers, sequence, status, conditions) as linked objects.
- **Recommendation:**
  - A universal triad: **Decision → Commitments it creates → Approvals it requires**, each linked to stakeholders and evidence.
  - Human-readable IDs (DEC-142, COM-88, APR-31), following Linear's pattern.
  - This makes the product a "decision memory", not a contact book.

### 3.3 Temporal relationship history
- **Observed gap:** Attio timelines log events. Kumu maps are snapshots. Stakeholder Circle tracks re-assessments manually.
- **Recommendation:**
  - Relationships, stances and influence carry **valid-from/valid-to dates**.
  - Users can ask "what did this coalition look like before the planning decision?"
  - A time-scrubber works on both the profile and the graph lens.
  - Stance changes become events with evidence.

### 3.4 Graph as lens, not graph as default
- **Observed:** Kumu's own guidance warns about hairballs and readers unfamiliar with network maps, and offers focus, prompted focus and showcase as remedies.
- **Recommendation:**
  - The default surfaces are lists, profiles and an attention inbox.
  - The graph opens **from context** (a person, organisation, decision or issue) at 1–2 degrees, with showcase dimming instead of filtering.
  - Saved "lenses" per audience (executive, field team, regulator), following Kumu's views-over-data idea.
  - No global "show everything" map by default.

### 3.5 Industry templates over a universal core
- **Observed:** Vertical SRMs hard-code industry modules (land access, consultation portals, social investment). Notion and Attio push schema design onto customers.
- **Recommendation:**
  - One fixed, opinionated core ontology (Stakeholder, Organisation, Relationship, Engagement, Issue, Decision, Commitment, Approval, Evidence).
  - Plus **industry templates**: custom fields, prioritisation models (power/interest, salience, Stakeholder Circle-style), report packs, and vocabulary such as "community member" vs "client sponsor" vs "board member".
  - Templates extend the core and never fork it, so cross-industry AI and analytics keep working.

### 3.6 Governance and auditability for regulated sectors
- **Observed:** Tractivity, Jambo, Simply Stakeholders and Borealis all lead with audit trails, ISO 27001 and similar certifications, regional hosting and compliance reports. Jambo states its AI does not train on customer data.
- **Recommendation:**
  - Immutable audit log of changes to decisions and approvals.
  - Field-level confidentiality (for example Indigenous relations, or personnel matters).
  - Regional data residency.
  - Explicit AI data-use commitments.
  - "Evidence pack" export for consultation reports and FOI requests.
  - These are table stakes. Ship them early or lose public-sector deals.

### 3.7 Keyboard-first speed
- **Observed:** Linear and Attio both use Cmd+K, `/` search, single-key creation and `?` for shortcut discovery. Linear's perceived instant feel is attributed (secondary sources) to local-first sync with optimistic updates.
- **Recommendation:**
  - Optimistic UI and local caching for the core workflows: logging an engagement, adding a commitment, recording a decision.
  - A command menu that is also an AI entry point (Attio's prompt-then-Tab).
  - Visible shortcut hints for occasional users.
  - Target: logging an interaction in under 10 seconds.

### 3.8 Risks
1. **Data-entry burden kills stakeholder tools.**
   - Every SRM leads with email add-ins, which signals that this is the universal failure mode.
   - Mitigation: passive capture (email, calendar, meeting transcripts) with AI-suggested structure that users confirm in one keystroke. Measure "interactions captured passively" vs "manually".
2. **Graph views become hairballs.** Kumu documents this.
   - Mitigation: graph-as-lens, degree limits, showcase, and clustering into coalitions.
3. **AI over-claims and erodes trust,** especially when inferred relationships are wrong or sensitive.
   - Mitigation: a suggested/confirmed state, provenance, and never auto-publishing inferences into reports.
4. **Privacy and legal exposure.**
   - Profiling individuals (politicians, community members) raises GDPR and sector-specific risks.
   - Mitigation: lawful-basis fields, retention policies, sensitive-field controls, and DPIA templates.
5. **The universal positioning dilutes the message.**
   - Buyers purchase for a vertical problem.
   - Mitigation: universal core, vertical go-to-market with templates.
6. **Sliding into a CRM or PM tool.**
   - Pipelines and task boards are tempting.
   - Mitigation: no deal stages. Tasks exist only as commitment follow-ups.
7. **Incumbent response.**
   - Attio or Notion could add templates. Vertical SRMs could add LLM features.
   - Our moat must be the evidence and decision model, not the UI alone.

---

## 4. Pattern library

| # | Pattern | Source | How we'd adapt it | Priority |
|---|---|---|---|---|
| 1 | Universal command menu (Cmd/Ctrl+K), context-aware actions | Linear, Attio | One menu for navigation, creation ("New decision…") and AI questions. Actions change with the current record. | P0 |
| 2 | `/` global search with ID addressing | Linear, Attio | Search stakeholders, organisations and decisions by name, email or domain, plus IDs (DEC-142, COM-88). | P0 |
| 3 | Human-readable object IDs | Linear | Citable IDs for Decisions, Commitments, Approvals and Issues in meetings and board papers. | P0 |
| 4 | Single-key create shortcuts plus `?` cheat sheet | Attio, Linear | `e` log engagement, `d` decision, `m` commitment, `?` shortcut sheet, with visible hints for occasional users. | P1 |
| 5 | Attention Inbox ("needs you" vs "FYI") | Linear | Overdue commitments, pending approvals, cooling relationships, unreviewed AI suggestions, each with a reason and evidence link. | P0 |
| 6 | Triage queue for inbound items | Linear | AI-extracted candidate commitments, decisions and stance changes from email and meetings land in triage for one-key confirm or reject. | P0 |
| 7 | Passive capture from email and calendar | Attio, SRMs (add-ins) | Auto-link interactions to people and organisations. AI proposes structured facts with provenance. | P0 |
| 8 | Record page with filterable activity timeline | Attio | Stakeholder timeline filtered by type (engagement, decision, commitment, stance change), with a time scrubber. | P0 |
| 9 | Context-specific attributes (list entries) | Attio | Per-programme role and stance ("champion in A, blocker in B") without duplicating the person. | P1 |
| 10 | Bidirectional typed relations plus "lookup through" filters | Attio, Notion | Relationships as edges with type, direction, strength, confidence, validity dates and evidence. Filter "stakeholders whose organisation opposes DEC-142". | P0 |
| 11 | Rollups / computed fields | Notion, Kumu | Explainable computed signals (open commitments count, days since contact, approval coverage), always decomposable. | P1 |
| 12 | Row-as-page (structured plus narrative) | Notion | Decision records combine structured fields with a rationale document and an embedded evidence list. | P1 |
| 13 | Linked views embedded in documents | Notion | Live "affected stakeholders" or "open commitments" blocks inside briefing packs and meeting notes. | P2 |
| 14 | Peek preview, then expand | Notion, Linear (reported) | Space or hover to peek a stakeholder or decision from any list or graph node without losing place. | P1 |
| 15 | Views as non-destructive saved lenses | Linear, Kumu, Attio | Saved lenses per audience (exec, field, regulator), with shareable URLs. | P1 |
| 16 | Prompted focus ("start from a person, out N") | Kumu | Graph opens from a context at degree 1–2. `+`/`-` to expand or contract, `Esc` to exit. | P0 (graph) |
| 17 | Showcase (dim) vs filter (hide) | Kumu | Default to dimming non-relevant nodes so political context is never silently removed. | P1 |
| 18 | Metric-driven visual encoding (betweenness, etc.) | Kumu | Size or colour by computed influence, with "why this size" explanations. Brokers and bridges surfaced as insights, not just pixels. | P2 |
| 19 | Loops / communities | Kumu | AI-suggested coalitions from co-engagement and shared stance, confirmed by humans and tracked over time. | P2 |
| 20 | Guided presentations through views | Kumu | "Stakeholder briefing" mode that steps through lenses for a steering committee. Exportable evidence pack. | P2 |
| 21 | Relationship health score | Simply Stakeholders | Keep the concept but make it transparent: components, weights, evidence and trend. | P1 |
| 22 | "Not contacted recently" plus map coverage gaps | Jambo | Attention signal for neglected high-influence stakeholders. Optional geo lens for infrastructure templates. | P1 |
| 23 | Configurable prioritisation model | Stakeholder Circle, Tractivity | Template-selectable models (power/interest, salience, power/proximity/urgency), with AI-proposed re-assessments. | P1 |

---

*Prepared from public sources only, as of 2026-10-22. All vendor claims (pricing, certifications, AI capabilities, customer counts) are as stated by vendors and have not been independently verified. Re-verify before external use.*
