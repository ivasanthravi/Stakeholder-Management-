# Pricing & Packaging Strategy

**Status: recommendation. No price is approved or published.** `shared/pricing.ts` has every plan at `approved: false`, so the site and app show "Pricing on request". Approving a price means:
- creating the price with the billing provider;
- setting the `BILLING_PRICE_*` env vars;
- setting `approved: true` with the same amounts.

All competitor facts below come from public pages accessed on 2026-10-23 (sources at the end). Where a page was ambiguous or blocked, that's stated.

## 1. What the market shows

| Pattern | Evidence |
|---|---|
| **Vertical stakeholder tools sell on quote, annually** | Borealis, Darzin and Simply Stakeholders publish no prices ("personalized quote", priced by users and modules). Borealis and Simply Stakeholders add one-time onboarding fees and multi-year terms. |
| **The vertical tools that do publish a price use a platform fee** | Tractivity: "from £9,495 per year" plus "£500 per additional user per year", no tiers, no free trial. Jambo Professional: "$995 USD per month" for 5 users. |
| **Horizontal relationship tools are self-serve per seat** | Attio: Plus $44 monthly / $35 annual, Pro $99 / $79 per user per month; free plan plus 14-day Pro trial. folk: €/$24–48 annual per member per month; 2-week trial, no card. Affinity: $2,000–2,700 per user per year, annual only. |
| **Trial length** | 14 days wherever a length is stated (Attio Pro, Airtable Team, Intercom; folk "2 weeks"). |
| **Freemium vs trial** | Freemium is common in horizontal tools (Attio, HubSpot, Linear, Notion, ClickUp, Airtable). None of the vertical stakeholder tools offers freemium. |
| **AI packaging** | Has moved to **included credits per seat or workspace, plus paid top-ups**: Attio, ClickUp, Airtable, HubSpot, Notion agents. Airtable removed its per-seat AI add-on on 24 Jun 2025. Outcome-based pricing exists (Intercom Fin $0.99 per outcome). |
| **Enterprise gating** | SAML/SCIM/audit logs sit in the top tier for horizontal tools. Vertical tools often include SSO lower down (Tractivity and Simply Stakeholders on all plans), because public-sector buyers expect it. |
| **Annual discount** | About 17–20% where stated (Attio 20%, Notion "up to 20%", folk 20%, Airtable Team about 17%). |

## 2. Options evaluated

| Model | For | Against | Verdict |
|---|---|---|---|
| Per seat | Familiar; scales with value; matches self-serve peers | Penalises inviting occasional contributors; AI cost isn't tied to seats | Base of the recommendation |
| Workspace (flat) | Simple; easy for public-sector budgets | Large teams under-pay; small teams over-pay | Possible later for Enterprise contracts |
| Usage-based AI | Recovers model cost exactly | Unpredictable bills worry public-sector buyers; needs a credit concept | Only as a *capped allowance*, with no automatic overage |
| Hybrid: seats + included AI allowance | Predictable bill, bounded AI cost, room for top-ups later | Buyers must understand the allowance | **Recommended** |
| Freemium | Top-of-funnel | Stakeholder data is sensitive and team-based; free workspaces carry AI and support costs; no vertical peer does it | **Not recommended** at launch |
| Free trial (no card) | Reaches value fast; matches the 14-day norm | Some trials won't convert | **Recommended:** 14 days, Professional, up to 10 people |
| Monthly and annual | Annual improves cash and retention; monthly lowers the barrier | Two prices per plan | **Both**, annual about 17–20% lower per month, in line with peers |

## 3. Recommendation (hypothesis to validate)

**Hybrid per-seat pricing with a pooled AI allowance, three tiers and a 14-day no-card trial of Professional.**

| | Starter | Professional | Enterprise |
|---|---|---|---|
| Who | One small team | Several initiatives and teams | Organisation-wide, procurement-led |
| Seats | Up to 5 | Up to 100 self-serve | By contract |
| Core (directory, organizations, initiatives, engagements, decisions, commitments, map, Command Center) | ✓ | ✓ | ✓ |
| Briefings, copilot | ✓ | ✓ | ✓ |
| Meeting intelligence, path finder, restricted records, audit log | — | ✓ | ✓ |
| AI allowance (model tokens per seat per month, pooled per workspace) | 150k | 600k | 1M, or by contract |
| SSO/SAML | — | — | Planned (not available) |
| Billing | Self-serve, monthly/annual | Self-serve, monthly/annual | Annual contract, invoice |

The built-in rules engine is never metered. Allowances limit only model calls, and when one runs out the product keeps working with facts and rules. Nothing is charged automatically beyond the plan.

### Price hypotheses for the founder to test (NOT approved)
- **Starter:** in the range of horizontal relationship tools' entry tiers (folk Standard, Attio Plus). Roughly **$25–35 per seat per month** monthly, about 20% less annually.
- **Professional:** between Attio Pro and the vertical tools' per-user cost. Roughly **$55–75 per seat per month**.
- **Enterprise:** annual contract. A platform fee plus per-seat pricing, as Tractivity and Jambo do, may suit public-sector buyers better than pure per-seat.

**Validate before approving:**
1. **Margin check against AI cost.**
   - The Phase 2 cost model estimates a heavy copilot user at about $0.06 per answer on Opus.
   - A Professional seat that uses its whole 600k-token allowance costs about $4–7 at Opus list prices, from about 80% input tokens (≈$4.3) to an even input/output split (≈$7.2).
   - Re-measure with real `ai_usage` data once a model key is configured.
2. **Five to ten buyer interviews:** public-sector and infrastructure buyers may require SSO at mid-tier and annual invoicing.
3. **Willingness-to-pay test** on the pricing page ("Talk to us" conversion) before publishing numbers.

### Packaging rules
- Data export is never gated: customers can always take their data.
- Seats = active members + pending invitations.
- Read-only access after a subscription ends lasts 90 days (see `billing-architecture.md`).
- No overage charges until explicitly approved and disclosed. The allowance is a hard cap with a clear message.
- Any change to `shared/plans.ts` changes entitlements immediately for every workspace on that plan. Treat it like a price change and give notice.

## 4. Decisions required
1. Approve or adjust the tiers and allowances above.
2. Approve prices (currency, monthly and annual), then configure them with the chosen provider.
3. Decide whether SSO moves to Professional once built (vertical buyers expect it).
4. Decide on a one-time onboarding fee for Enterprise (common in vertical tools).

## Sources (accessed 2026-10-23)
- **Vertical stakeholder tools:**
  - https://www.boreal-is.com/pricing/
  - https://www.darzin.com/pricing
  - https://simplystakeholders.com/software-pricing/
  - https://www.tractivity.co.uk/pricing
  - https://www.jambo.cloud/pricing
- **Relationship CRMs:**
  - https://attio.com/pricing
  - https://www.affinity.co/pricing
  - https://www.folk.app/pricing
  - https://www.hubspot.com/pricing/sales — monthly/annual labelling ambiguous on the page
  - Pipedrive: page blocked automated access, not quoted
- **Packaging references:**
  - https://linear.app/pricing
  - https://www.notion.com/pricing
  - https://clickup.com/pricing
  - https://www.airtable.com/pricing
  - https://support.airtable.com/articles/2277136852-airtable-plans-overview
  - https://www.intercom.com/pricing
- **Caveat:** prices were read from page text. Attio's, HubSpot's and Intercom's monthly-vs-annual toggles were ambiguous in text form. Re-check them in a browser before quoting externally.
