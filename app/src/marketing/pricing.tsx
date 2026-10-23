// Plans, comparison and FAQ. Plan data comes from the public catalog API (shared/plans.ts is the fallback while it loads).
// Prices are shown only when the API returns an approved price; today none is approved, so every plan reads "Pricing on request".
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Clock, CreditCard, Minus, Plus, RotateCcw, ShieldCheck } from 'lucide-react'
import { usePublicPlans, type CatalogPlan } from '../api/commercial'
import { FEATURES, PLANNED_FEATURES, PLANS, PLAN_IDS, POLICY, type Feature } from '../../shared/plans'
import { SiteLayout } from './Layout'
import { CtaBand, Eyebrow, PageHero, Reveal, usePageMeta } from './parts'

const FALLBACK: CatalogPlan[] = PLAN_IDS.map(id => {
  const p = PLANS[id]
  return {
    id, name: p.name, tagline: p.tagline, seatLimit: p.seatLimit, aiTokensPerSeat: p.aiTokensPerSeat, selfServe: p.selfServe,
    features: p.features.map(f => ({ id: f, label: FEATURES[f], planned: PLANNED_FEATURES.includes(f) })),
    price: null, purchasable: { month: p.selfServe, year: p.selfServe },
  }
})

export function usePlans() {
  const q = usePublicPlans()
  return {
    plans: q.data?.plans ?? FALLBACK,
    trialDays: q.data?.trialDays ?? POLICY.trialDays,
    trialSeats: q.data?.trialSeats ?? POLICY.trialSeats,
  }
}

const seatsLabel = (p: CatalogPlan) => (p.seatLimit ? `Up to ${p.seatLimit} people` : 'Seats set by contract')

function PriceBlock({ plan }: { plan: CatalogPlan }) {
  const pr = plan.price
  if (pr?.approved && pr.monthly != null) {
    return (
      <div className="price">
        <b>${pr.monthly}<span style={{ font: 'inherit', fontSize: 14, fontWeight: 400, color: 'var(--text-2)' }}> per person / month</span></b>
        {pr.annualMonthly != null && <span>${pr.annualMonthly} per person / month, billed annually</span>}
      </div>
    )
  }
  return (
    <div className="price">
      <b>Pricing on request</b>
      <span>{plan.selfServe ? 'Monthly or annual billing.' : 'Sales-led, with terms set by contract.'} <Link to="/contact" className="mk-link" style={{ fontSize: 13.5 }}>Talk to us</Link></span>
    </div>
  )
}

export function PlanCards({ compact }: { compact?: boolean }) {
  const { plans, trialDays } = usePlans()
  return (
    <div className="mk-plans">
      {plans.map(p => {
        const hl = p.id === 'professional'
        const prev = plans[plans.indexOf(p) - 1]
        const fresh = compact && prev ? p.features.filter(f => !prev.features.some(x => x.id === f.id)) : p.features
        const shown = compact ? fresh.slice(0, 4) : p.features
        return (
          <article key={p.id} className={`mk-plan ${hl ? 'hl' : ''}`} aria-labelledby={`plan-${p.id}`}>
            {hl && <span className="flag">{trialDays}-day free trial</span>}
            <div>
              <h3 id={`plan-${p.id}`} className="name">{p.name}</h3>
              <p className="tagline">{p.tagline}</p>
            </div>
            <PriceBlock plan={p} />
            <ul aria-label={`${p.name} includes`}>
              <li><Check size={16} aria-hidden /><span>{seatsLabel(p)}</span></li>
              <li><Check size={16} aria-hidden /><span>Directory, map, engagements, decisions and commitments</span></li>
              {compact && prev && <li><Check size={16} aria-hidden /><span>Everything in {prev.name}, plus:</span></li>}
              {shown.map(f => (
                <li key={f.id} className={f.planned ? 'planned' : ''}>
                  {f.planned ? <Clock size={16} aria-hidden /> : <Check size={16} aria-hidden />}
                  <span>{f.label}</span>
                  {f.planned && <span className="mk-planned">Planned</span>}
                </li>
              ))}
            </ul>
            {p.selfServe
              ? <Link to="/sign-up" className={`mk-btn ${hl ? 'mk-btn-primary' : 'mk-btn-secondary'}`}>Start free trial</Link>
              : <Link to="/contact?topic=sales" className="mk-btn mk-btn-secondary">Talk to sales</Link>}
          </article>
        )
      })}
    </div>
  )
}

export function TrialTerms() {
  const { trialDays, trialSeats } = usePlans()
  return (
    <ul className="mk-terms" aria-label="Trial and billing terms">
      <li><Check size={15} aria-hidden />{trialDays}-day trial of Professional for up to {trialSeats} people</li>
      <li><CreditCard size={15} aria-hidden />No card required to start</li>
      <li><RotateCcw size={15} aria-hidden />Cancel any time</li>
      <li><ShieldCheck size={15} aria-hidden />Read-only for {POLICY.readOnlyRetentionDays} days after a plan ends, so you can export</li>
    </ul>
  )
}

/* ── Comparison ───────────────────────────────────────────────────────── */
const CORE = [
  'Stakeholder directory with filters, sorting and ⌘K',
  'Organizations and initiatives, with your vocabulary',
  'Relationship map and influence grid',
  'Engagements, decisions and commitments',
  'Command Center rule-based signals',
  'In-app inbox and daily commitments digest',
  'Roles and email invitations',
  'Full workspace export (JSON)',
]

function Cell({ v }: { v: boolean | 'planned' | string }) {
  if (v === 'planned') return <td><span className="mk-planned">Planned</span></td>
  if (v === true) return <td><Check size={17} className="yes" aria-label="Included" /></td>
  if (v === false) return <td><Minus size={17} className="no" aria-label="Not included" /></td>
  return <td>{v}</td>
}

function Compare() {
  const { plans } = usePlans()
  const featureIds = [...new Set(plans.flatMap(p => p.features.map(f => f.id)))] as Feature[]
  const label = (id: Feature) => plans.flatMap(p => p.features).find(f => f.id === id)?.label ?? FEATURES[id]
  const has = (p: CatalogPlan, id: Feature): boolean | 'planned' => {
    const f = p.features.find(x => x.id === id)
    return f ? (f.planned ? 'planned' : true) : false
  }
  return (
    <div className="mk-compare-wrap" role="region" aria-labelledby="compare-title" tabIndex={0}>
      <table className="mk-compare">
        <caption className="sr-only">Feature comparison across Meridian plans</caption>
        <thead>
          <tr><th scope="col">Feature</th>{plans.map(p => <th scope="col" key={p.id}>{p.name}</th>)}</tr>
        </thead>
        <tbody>
          <tr className="grp"><th scope="colgroup" colSpan={plans.length + 1}>Plan</th></tr>
          <tr><th scope="row">People</th>{plans.map(p => <Cell key={p.id} v={p.seatLimit ? `Up to ${p.seatLimit}` : 'By contract'} />)}</tr>
          <tr><th scope="row">Billing</th>{plans.map(p => <Cell key={p.id} v={p.selfServe ? 'Monthly or annual' : 'Sales-led'} />)}</tr>
          <tr><th scope="row">Price</th>{plans.map(p => <Cell key={p.id} v={p.price?.approved ? 'See above' : 'On request'} />)}</tr>
          <tr className="grp"><th scope="colgroup" colSpan={plans.length + 1}>Workspace</th></tr>
          {CORE.map(c => <tr key={c}><th scope="row">{c}</th>{plans.map(p => <Cell key={p.id} v />)}</tr>)}
          <tr className="grp"><th scope="colgroup" colSpan={plans.length + 1}>Intelligence and control</th></tr>
          {featureIds.map(id => <tr key={id}><th scope="row">{label(id)}</th>{plans.map(p => <Cell key={p.id} v={has(p, id)} />)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

/* ── FAQ ──────────────────────────────────────────────────────────────── */
function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details>
      <summary>{q}<Plus size={18} aria-hidden /></summary>
      <div className="ans">{children}</div>
    </details>
  )
}

export function PricingPage() {
  usePageMeta('Pricing — Meridian', 'Meridian plans: Starter, Professional and Enterprise. Start a 14-day free trial of Professional with no card required.')
  const { trialDays, trialSeats } = usePlans()
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Pricing"
        title={<>Simple plans. <em>No surprises.</em></>}
        lede={<>Try Professional free for {trialDays} days with up to {trialSeats} people, with no card required. Public prices aren’t published yet, so we’ll quote for your team.</>}
      />
      <section className="mk-section tight-top" style={{ paddingTop: 0 }} aria-label="Plans">
        <div className="mk-wrap">
          <Reveal><PlanCards /></Reveal>
          <TrialTerms />
        </div>
      </section>
      <section className="mk-section alt" aria-labelledby="compare-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Compare plans</Eyebrow>
            <h2 id="compare-title" className="mk-h2">What each plan includes</h2>
          </Reveal>
          <Reveal><Compare /></Reveal>
          <p className="mk-sample" style={{ justifyContent: 'flex-start' }}>“Planned” means listed for the plan but not available yet.</p>
        </div>
      </section>
      <section className="mk-section" aria-labelledby="faq-title">
        <div className="mk-wrap">
          <Reveal className="mk-head center">
            <Eyebrow plain>Questions</Eyebrow>
            <h2 id="faq-title" className="mk-h2">Frequently asked</h2>
          </Reveal>
          <Reveal className="mk-faq">
            <Faq q="How does the free trial work?">
              <p>Every new workspace starts with {trialDays} days of the Professional plan for up to {trialSeats} people. You don’t need a card to start.</p>
            </Faq>
            <Faq q="What happens when the trial ends?">
              <p>Choose a plan to keep working. If you don’t, the workspace becomes read-only for {POLICY.readOnlyRetentionDays} days so you can export everything. Nothing is deleted.</p>
            </Faq>
            <Faq q="Can I pay monthly or annually?">
              <p>Starter and Professional can be billed monthly or annually. Enterprise is arranged with our sales team.</p>
            </Faq>
            <Faq q="Can I cancel any time?">
              <p>Yes. When you cancel, access continues to the end of the period you’ve paid for.</p>
            </Faq>
            <Faq q="What happens to our data after we cancel?">
              <p>Cancelling doesn’t delete anything. After the subscription ends the workspace is read-only for {POLICY.readOnlyRetentionDays} days, and admins can download a full workspace export (JSON) at any time.</p>
              <p>If you want the workspace gone, an owner can delete it. Deletion has a 14-day cooling-off period that can be cancelled.</p>
            </Faq>
            <Faq q="How is billing handled securely?">
              <p>Payments go through the payment provider’s hosted checkout. Meridian never sees or stores card numbers, and billing webhooks are signature-verified.</p>
              <p>Only workspace owners can change billing, and owners can view invoices from the workspace’s billing settings.</p>
            </Faq>
            <Faq q="Why aren’t prices listed?">
              <p>We haven’t published public prices yet. <Link to="/contact?topic=sales" className="mk-link" style={{ fontSize: 'inherit' }}>Tell us about your team</Link> and we’ll come back with a quote. You can start a trial in the meantime.</p>
            </Faq>
            <Faq q="Do you offer single sign-on?">
              <p>SSO/SAML is planned for Enterprise and isn’t available today. Meridian doesn’t offer multi-factor authentication yet either. See <Link to="/security" className="mk-link" style={{ fontSize: 'inherit' }}>Security</Link> for what is in place.</p>
            </Faq>
          </Reveal>
        </div>
      </section>
      <section className="mk-section alt" aria-labelledby="ent-title" style={{ paddingBlock: 'clamp(64px, 8vw, 104px)' }}>
        <div className="mk-wrap">
          <Reveal className="mk-split" style={{ alignItems: 'center' }}>
            <div className="mk-split-copy">
              <Eyebrow plain>Enterprise</Eyebrow>
              <h2 id="ent-title" className="mk-h2" style={{ fontSize: 'clamp(28px, 3.2vw, 40px)' }}>Larger rollout, security review or a contract to agree?</h2>
            </div>
            <div className="mk-split-copy">
              <p className="mk-body">Enterprise is sales-led, with seats set by contract. Tell us what you need and we’ll answer honestly about what Meridian does today and what is planned.</p>
              <div className="mk-ctas">
                <Link to="/contact?topic=sales" className="mk-btn mk-btn-primary">Talk to sales <ArrowRight size={16} className="mk-arrow" aria-hidden /></Link>
                <Link to="/security" className="mk-btn mk-btn-secondary">Read about security</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}
