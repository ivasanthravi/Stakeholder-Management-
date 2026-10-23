// Public homepage: the product story in ten beats, told with real screenshots of the sample workspace.
import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight, BadgeCheck, Building2, CalendarClock, Check, ChevronRight, CreditCard, Database, FileSearch, Handshake,
  Home as HomeIcon, KeyRound, MessagesSquare, Scale, ScrollText, Target, User, UserX, Users,
} from 'lucide-react'
import { TEMPLATES } from '../../shared/templates'
import { ease, t } from '../lib/motion'
import { SiteLayout } from './Layout'
import { CtaBand, Eyebrow, Frame, MoreLink, Pin, Reveal, SampleNote, Shot, TrialCTAs, useDrift, usePageMeta } from './parts'
import { PlanCards, TrialTerms } from './pricing'

/* ── 1 · Hero ─────────────────────────────────────────────────────────── */
function SignalCard() {
  return (
    <div className="mk-ui mk-ui-pad" style={{ display: 'grid', gap: 8 }}>
      <div className="mk-ui-row" style={{ justifyContent: 'space-between' }}>
        <span className="mk-ui-row"><span className="cap">Why it matters</span><span className="tag rule">Rule-based</span></span>
        <span className="key">D-110</span>
      </div>
      <div className="ttl">Design freeze for Brockley junction</div>
      <div className="meta">3 days past its decision date · proposed</div>
      <div className="meta" style={{ color: 'var(--text-2)', fontSize: 12 }}>Rule: decision still proposed or under review within 7 days of its due date.</div>
      <div className="next">
        <span><span className="cap" style={{ display: 'block' }}>Suggested next step</span><span className="meta" style={{ color: 'var(--text-1)' }}>Review what the approvers still need.</span></span>
        <span className="mini-btn">Review <ChevronRight size={12} aria-hidden /></span>
      </div>
    </div>
  )
}

function Hero() {
  const stage = useRef<HTMLDivElement>(null)
  const yMain = useDrift(stage, 18)
  const yMap = useDrift(stage, 44)
  const yCard = useDrift(stage, 70)
  const enter = (d: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.42, ease: ease.emphasized, delay: d } })
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-hero-grid" aria-hidden />
      <div className="mk-wrap">
        <div className="mk-hero-copy">
          <motion.div {...enter(0)}>
            <Link to="/ai" className="mk-badge"><i aria-hidden />Meeting notes in, quote-backed proposals out<ChevronRight size={14} aria-hidden /></Link>
          </motion.div>
          <motion.h1 id="hero-title" className="mk-h1" {...enter(0.04)}>
            <span className="ln">Every relationship.</span>{' '}
            <span className="ln">Every decision.</span>{' '}
            <span className="ln ln-serif">One intelligent workspace.</span>
          </motion.h1>
          <motion.p className="mk-hero-sub" {...enter(0.1)}>
            Meridian keeps the people, meetings, decisions and commitments behind your work in one place, and tells you
            what needs attention, and why.
          </motion.p>
          <motion.div className="mk-hero-actions" style={{ display: 'grid', gap: 14, justifyItems: 'center' }} {...enter(0.16)}>
            <TrialCTAs />
          </motion.div>
        </div>
        <div className="mk-meridian" aria-hidden>
          <motion.span initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.4, ease: ease.emphasized, delay: 0.3 }} />
          <b />
        </div>
        <div className="mk-stage" ref={stage}>
          <motion.div className="mk-stage-main" style={{ y: yMain }} {...enter(0.22)}>
            <Frame title="Home · Westshire Infrastructure">
              <Shot
                name="home" priority display={1200}
                mobileCrop={{ x: 264, y: 70, w: 600, h: 560 }}
                alt="Meridian Command Center: a greeting summarising 9 overdue commitments, 5 decisions waiting and 7 cooling relationships, a workspace briefing with cited metrics, a Needs attention list, stakeholder stance totals and a 30-day commitment horizon."
              />
            </Frame>
          </motion.div>
          <motion.div className="mk-stage-map" style={{ y: yMap }} {...enter(0.32)}>
            <Frame float title="Stakeholders · Map">
              <Shot
                name="map" priority display={530}
                crop={{ x: 540, y: 150, w: 660, h: 440 }}
                alt="Close-up of the relationship map: stakeholders clustered by organization, each circle coloured and labelled by stance, connected by recorded relationships."
              />
            </Frame>
          </motion.div>
          <motion.div className="mk-stage-card" style={{ y: yCard }} {...enter(0.4)}>
            <SignalCard />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ── 2 · The problem ──────────────────────────────────────────────────── */
function Problem() {
  return (
    <section className="mk-section" aria-labelledby="problem-title">
      <div className="mk-wrap">
        <div className="mk-problem">
          <Reveal className="mk-stack" style={{ gap: 22 }}>
            <Eyebrow n="01">The problem</Eyebrow>
            <h2 id="problem-title" className="mk-h2">Stakeholder knowledge lives everywhere <em>except where decisions are made.</em></h2>
            <p className="mk-lede">
              A spreadsheet that was accurate in spring. A promise made in a site meeting and written in one notebook.
              An inbox thread that holds the only record of who agreed to what. Everyone has a piece; nobody has the picture.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="mk-scatter" role="img" aria-label="Illustration: stakeholder information scattered across a spreadsheet, an email thread, handwritten notes, a chat message and a postponed calendar entry.">
              <div className="mk-frag sheet" aria-hidden>
                <div className="fh"><Database size={12} />stakeholders_v7_FINAL (2).xlsx</div>
                <table>
                  <thead><tr><th>Name</th><th>Org</th><th>Stance</th><th>Last contact</th></tr></thead>
                  <tbody>
                    <tr><td>B. Ellwood</td><td>County</td><td className="q">??</td><td>Aug?</td></tr>
                    <tr><td>J. Thorne</td><td>Residents</td><td>against</td><td>—</td></tr>
                    <tr><td>F. Ellwood</td><td>ACF</td><td>ask Tom</td><td>Jun</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="mk-frag mail" aria-hidden>
                <div className="fh"><span className="av">JT</span>Jonah T. · Inbox</div>
                <div className="fb"><b style={{ fontWeight: 550 }}>Re: Fwd: Re: working hours</b><br /><span style={{ color: 'var(--text-2)' }}>Did we actually agree to drop Sundays, or was that just discussed?</span></div>
              </div>
              <div className="mk-frag note" aria-hidden>
                <div className="fb">Bea: council won’t oppose <u>if</u> hedgerow offset. Send plan by <s>1 Nov</s> 6 Nov?? — who’s doing this</div>
              </div>
              <div className="mk-frag chat" aria-hidden>
                <div className="fh"><MessagesSquare size={12} />#nrl-project</div>
                <div className="fb">Who owns the landowner relationship now that Tom has moved teams?</div>
              </div>
              <div className="mk-frag cal" aria-hidden>
                <div className="fh"><CalendarClock size={12} />Steering group · moved again</div>
                <div className="fb">Decision on design freeze: <span style={{ color: 'var(--attention)' }}>postponed, approvers unclear</span></div>
              </div>
            </div>
          </Reveal>
        </div>
        <ul className="mk-pains">
          {[
            { icon: Handshake, h: 'Missed commitments', p: 'Promises made in meetings live in personal notes. Nobody notices one slipping until the stakeholder chases it.' },
            { icon: UserX, h: 'Unclear accountability', p: 'When a relationship owner changes role, the history, the context and the open promises leave with them.' },
            { icon: Scale, h: 'Delayed decisions', p: 'Approvers, consulted parties and needed-by dates are spread across threads, so decisions quietly wait.' },
          ].map((x, i) => (
            <Reveal as="li" key={x.h} delay={i * 0.06}>
              <x.icon size={20} className="ic" aria-hidden />
              <h3 className="mk-h4">{x.h}</h3>
              <p className="mk-small" style={{ fontSize: 15, lineHeight: '24px' }}>{x.p}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ── 3 · The solution ─────────────────────────────────────────────────── */
const OBJECTS = [
  { icon: User, b: 'Stakeholders', s: 'Role, stance, influence, interest and an owner' },
  { icon: Building2, b: 'Organizations', s: 'Who people work for and with' },
  { icon: Target, b: 'Initiatives', s: 'Projects, programmes or clients' },
  { icon: MessagesSquare, b: 'Engagements', s: 'Meetings, calls, site visits, notes' },
  { icon: Scale, b: 'Decisions', s: 'Approvers, consulted, needed-by' },
  { icon: Handshake, b: 'Commitments', s: 'Promises, owners and due dates' },
]
const HOME_PINS = [
  { n: 1, x: 18.2, y: 16.6, b: 'Workspace briefing', p: 'Facts and metrics from your records, each with how it is counted and citations to the source.' },
  { n: 2, x: 18.2, y: 57.8, b: 'Rule-based signals', p: 'Overdue, due soon, decisions waiting, cooling relationships, stance shifts and unowned key people.' },
  { n: 3, x: 18.2, y: 70.5, b: 'Why it’s flagged', p: 'Every signal shows the rule that raised it and the evidence behind it.' },
  { n: 4, x: 38.9, y: 76.7, b: 'A suggested next step', p: 'One action that opens the right record or form. Nothing runs on its own.' },
  { n: 5, x: 73, y: 57.8, b: 'Stance at a glance', p: 'Recorded by your team, always labelled, never colour alone.' },
  { n: 6, x: 73, y: 74.7, b: 'Commitment horizon', p: 'What is overdue, what is due this week and what is coming in the next 30 days.' },
]
function Solution() {
  return (
    <section className="mk-section alt" aria-labelledby="solution-title">
      <div className="mk-wrap">
        <Reveal className="mk-head center">
          <Eyebrow n="02">The workspace</Eyebrow>
          <h2 id="solution-title" className="mk-h2">One connected record of the people, promises and decisions <em>behind your work.</em></h2>
          <p className="mk-lede" style={{ marginInline: 'auto' }}>
            Six kinds of record, linked to each other. Log a meeting once and it updates the stakeholder’s history,
            the decision it informed and the commitments it created.
          </p>
        </Reveal>
        <ul className="mk-rail">
          {OBJECTS.map((o, i) => (
            <Reveal as="li" key={o.b} delay={i * 0.04}>
              <span className="ic"><o.icon size={20} aria-hidden /></span>
              <b>{o.b}</b>
              <span>{o.s}</span>
            </Reveal>
          ))}
        </ul>
        <Reveal>
          <div style={{ position: 'relative' }}>
            <Frame title="Home · Command Center">
              <Shot
                name="home-signal" display={1200}
                mobileCrop={{ x: 264, y: 520, w: 560, h: 420 }}
                alt="The Command Center with a signal expanded: Decision waiting, D-110 Design freeze for Brockley junction. The panel explains why it matters, names the rule that raised it, and offers a suggested next step, Review decision."
              />
              {HOME_PINS.map(p => <Pin key={p.n} {...p} />)}
            </Frame>
          </div>
          <SampleNote />
        </Reveal>
        <ol className="mk-legend">
          {HOME_PINS.map((p, i) => (
            <Reveal as="li" key={p.n} delay={i * 0.03}>
              <span className="n" aria-hidden>{p.n}</span>
              <div><b>{p.b}</b><p>{p.p}</p></div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ── 4 · Stakeholder Universe ─────────────────────────────────────────── */
function Universe() {
  const vis = useRef<HTMLDivElement>(null)
  const yFloat = useDrift(vis, 28)
  return (
    <section className="mk-section" aria-labelledby="universe-title">
      <div className="mk-wrap">
        <div className="mk-split">
          <Reveal className="mk-split-copy">
            <Eyebrow n="03">Stakeholder universe</Eyebrow>
            <h2 id="universe-title" className="mk-h2">See how everyone is connected, <em>in context.</em></h2>
            <p className="mk-body">
              Map the relationships your team has recorded: who reports to whom, who influences, who is allied and who opposes.
              Select anyone to see their stance, influence, owner and recent engagement without leaving the map.
            </p>
            <ul className="mk-checks">
              <li><Check size={16} aria-hidden /><span><b>Network map</b> of recorded relationships, grouped by organization.</span></li>
              <li><Check size={16} aria-hidden /><span><b>Influence grid</b> of influence against interest. People not yet assessed are listed, never guessed.</span></li>
              <li><Check size={16} aria-hidden /><span><b>Find a path</b> between two people through recorded relationships, up to four steps.</span></li>
              <li><Check size={16} aria-hidden /><span><b>Profiles</b> with relationships, engagement history, commitments and decisions.</span></li>
            </ul>
            <div><MoreLink to="/relationship-mapping">Explore relationship mapping</MoreLink></div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="mk-visual" ref={vis} style={{ paddingBottom: '6%' }}>
              <Frame title="Stakeholders · Map">
                <Shot
                  name="map" display={700}
                  crop={{ x: 480, y: 134, w: 760, h: 620 }}
                  mobileCrop={{ x: 520, y: 150, w: 620, h: 520 }}
                  alt="Network map for the Eastgate Depot Renewal initiative: 86 people and 82 relationships, grouped into organization clusters, with a stance legend (opposed, concerned, neutral, supporter, champion) shown by colour and label."
                />
              </Frame>
              <motion.div className="float-a" style={{ y: yFloat }}>
                <Frame float title="Fiona Ellwood">
                  <Shot
                    name="map-selected" display={330}
                    crop={{ x: 994, y: 150, w: 440, h: 380 }}
                    alt="Selected stakeholder panel for Fiona Ellwood, Owner at Ashby Cross Farms: neutral stance, very high influence and interest, owner Daniel Osei, 5 engagements in the last 60 days, and her recorded relationships."
                  />
                </Frame>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ── 5 · AI intelligence ──────────────────────────────────────────────── */
const AI_TABS = [
  {
    id: 'meetings', label: 'Meeting intelligence',
    title: 'From meeting notes to proposed records, each one backed by a quote.',
    points: [
      'Load notes or a transcript (.txt, .md, .vtt, .srt).',
      'Meridian proposes decisions, commitments and actions, each tied to the verbatim quote it came from.',
      'Stated and inferred items look different, so you know what to confirm.',
      'Nothing is saved until a person accepts it.',
    ],
    shot: { name: 'intelligence', crop: { x: 232, y: 56, w: 1208, h: 844 }, mobileCrop: { x: 940, y: 200, w: 500, h: 560 },
      alt: 'Meeting intelligence for an engagement: source notes on the left with stated, inferred and ignored-instruction highlights; on the right, a review list of proposed decisions, each quoting the sentence it came from, with Accept and Reject buttons.' },
    frame: 'Engagement · Meeting intelligence',
  },
  {
    id: 'briefings', label: 'Briefings',
    title: 'Briefings that read like a dossier, and cite every line.',
    points: [
      'Stakeholder briefings in three depths: brief, detailed and meeting prep.',
      'Decision and workspace briefings for the bigger picture.',
      'Facts, metrics with their method, and rule-based recommendations.',
      'With a model configured, an AI interpretation is added, clearly marked and cited.',
    ],
    shot: { name: 'briefing-prep', crop: { x: 440, y: 60, w: 780, h: 720 }, mobileCrop: { x: 460, y: 260, w: 700, h: 560 },
      alt: 'Meeting prep briefing for Fiona Ellwood: talking points, context and recent engagement, each sentence followed by a numbered citation, labelled as produced by the built-in rules engine.' },
    frame: 'Fiona Ellwood · Briefing',
  },
  {
    id: 'copilot', label: 'Copilot',
    title: 'Ask a question. Get an answer with its sources.',
    points: [
      'Open the copilot from anywhere with ⌘J.',
      'Answers come only from records you are allowed to see.',
      'Numbered citations link each claim to the record it came from.',
      'Conversation retention is configurable, including not storing history at all.',
    ],
    shot: { name: 'copilot', crop: { x: 700, y: 8, w: 740, h: 884 }, mobileCrop: { x: 1012, y: 8, w: 428, h: 560 },
      alt: 'Copilot panel beside the Command Center: an answer listing overdue commitments followed by a numbered list of 18 source records, suggested follow-up questions and an input for a new question.' },
    frame: 'Copilot',
  },
] as const

export function AITabs() {
  const [tab, setTab] = useState(0)
  const reduce = useReducedMotion()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? AI_TABS.length - 1 : (tab + d + AI_TABS.length) % AI_TABS.length
    setTab(next); refs.current[next]?.focus()
  }
  const cur = AI_TABS[tab]
  return (
    <>
      <div className="mk-tabs" role="tablist" aria-label="AI capabilities" onKeyDown={onKey}>
        {AI_TABS.map((x, i) => (
          <button
            key={x.id} ref={el => { refs.current[i] = el }} role="tab" id={`ai-tab-${x.id}`} aria-controls={`ai-panel-${x.id}`}
            aria-selected={tab === i} tabIndex={tab === i ? 0 : -1} className="mk-tab" onClick={() => setTab(i)}
          >
            {tab === i && <motion.span layoutId="ai-tab-bg" className="bg" transition={t.indicator} />}
            <span className="lb">{x.label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={cur.id} role="tabpanel" id={`ai-panel-${cur.id}`} aria-labelledby={`ai-tab-${cur.id}`} className="mk-ai-panel"
          initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0, transition: t.base }} exit={{ opacity: 0, transition: t.exit }}
        >
          <div className="mk-ai-copy">
            <h3 className="mk-h3" style={{ fontSize: 24, lineHeight: '32px', letterSpacing: '-0.024em' }}>{cur.title}</h3>
            <ul className="mk-checks">
              {cur.points.map(p => <li key={p}><Check size={16} aria-hidden /><span>{p}</span></li>)}
            </ul>
          </div>
          <div>
            <Frame title={cur.frame}>
              <Shot name={cur.shot.name} crop={cur.shot.crop} mobileCrop={cur.shot.mobileCrop} alt={cur.shot.alt} display={760} />
            </Frame>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function Intelligence() {
  return (
    <section className="mk-section dark" aria-labelledby="ai-title">
      <div className="mk-wrap">
        <Reveal className="mk-head split">
          <Eyebrow n="04">Intelligence</Eyebrow>
          <h2 id="ai-title" className="mk-h2">Intelligence that <em>shows its work.</em></h2>
          <p className="mk-lede">
            Meridian proposes; people decide. Every summary, signal and suggestion points back to the records and quotes it
            came from, and says which engine produced it.
          </p>
        </Reveal>
        <Reveal><AITabs /></Reveal>
        <Reveal className="mk-engines">
          <div>
            <span className="lbl"><i aria-hidden />Built-in rules engine</span>
            <h3 className="mk-h4">Works out of the box. No data sent anywhere.</h3>
            <p className="mk-small">Pattern matching and rules over your own records produce signals, briefings and meeting proposals.</p>
          </div>
          <div>
            <span className="lbl"><i className="ai" aria-hidden />Large language model</span>
            <h3 className="mk-h4">A Claude model, when your operator enables one.</h3>
            <p className="mk-small">Adds cited interpretation and richer extraction. Model output is always labelled as AI.</p>
          </div>
          <p className="mk-engines-note">AI features run on a built-in rules engine, or on a large language model when enabled. Every output tells you which.</p>
        </Reveal>
        <ul className="mk-principles">
          {[
            { k: 'Quote-backed', h: 'Every proposal has a source', p: 'Each proposed decision or commitment is tied to the exact words in the notes.' },
            { k: 'Human approval', h: 'Nothing is saved on its own', p: 'Proposals stay proposals until someone on your team accepts them.' },
            { k: 'Instruction-aware', h: 'Notes can’t give orders', p: 'Instruction-like text in imported notes is flagged and ignored, and stays visible in the source.' },
          ].map((x, i) => (
            <Reveal as="li" key={x.k} delay={i * 0.05}>
              <span className="mk-mono">{x.k}</span>
              <h3 className="mk-h4">{x.h}</h3>
              <p className="mk-small">{x.p}</p>
            </Reveal>
          ))}
        </ul>
        <div className="mk-mt-m"><MoreLink to="/ai">How AI works in Meridian</MoreLink></div>
      </div>
    </section>
  )
}

/* ── 6 · Operational workflow ─────────────────────────────────────────── */
function Workflow() {
  const reduce = useReducedMotion()
  return (
    <section className="mk-section" aria-labelledby="flow-title">
      <div className="mk-wrap">
        <Reveal className="mk-head split">
          <Eyebrow n="05">Workflow</Eyebrow>
          <h2 id="flow-title" className="mk-h2">From conversation to commitment, <em>nothing falls between.</em></h2>
          <p className="mk-body" style={{ fontSize: 17, lineHeight: '28px' }}>
            Every meeting can produce decisions and commitments that stay linked to where they were agreed.
            Owners and due dates are explicit, and the Command Center follows up when something slips.
          </p>
        </Reveal>
        <ol className="mk-flow">
          <motion.span
            className="mk-flow-line" aria-hidden
            initial={{ scaleX: reduce ? 1 : 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: '0px 0px -15% 0px' }}
            transition={{ duration: 0.42, ease: ease.emphasized }}
          />
          <Reveal as="li">
            <span className="step" aria-hidden>01</span>
            <h3 className="mk-h4">Engagement</h3>
            <p className="mk-small">Log meetings, calls, emails, workshops, consultations, site visits and notes, with participants.</p>
            <div className="mk-ui mk-ui-pad" style={{ display: 'grid', gap: 6 }} aria-hidden>
              <div className="mk-ui-row"><MessagesSquare size={14} color="var(--text-2)" /><span className="key">E-3936</span><span className="cap">Meeting · 22 Oct</span></div>
              <div className="ttl">NRL planning liaison — Westshire County Council</div>
              <div className="meta">4 participants · notes attached</div>
            </div>
          </Reveal>
          <Reveal as="li" delay={0.06}>
            <span className="step" aria-hidden>02</span>
            <h3 className="mk-h4">Decision</h3>
            <p className="mk-small">Proposed, under review, then approved, rejected or deferred, with approvers and a needed-by date.</p>
            <div className="mk-ui mk-ui-pad" style={{ display: 'grid', gap: 6 }} aria-hidden>
              <div className="mk-ui-row"><Scale size={14} color="var(--text-2)" /><span className="key">D-107</span><span className="tag warn">Under review</span></div>
              <div className="ttl">Community fund allocation round 1</div>
              <div className="meta">Needed by 29 Oct · 4 approvers · 4 consulted</div>
            </div>
          </Reveal>
          <Reveal as="li" delay={0.12}>
            <span className="step" aria-hidden>03</span>
            <h3 className="mk-h4">Commitment</h3>
            <p className="mk-small">Promises made by you or to you, each with an accountable owner, a due date and its source meeting.</p>
            <div className="mk-ui mk-ui-pad" style={{ display: 'grid', gap: 6 }} aria-hidden>
              <div className="mk-ui-row"><Handshake size={14} color="var(--text-2)" /><span className="key">C-176</span><span className="tag crit">Overdue</span></div>
              <div className="ttl">Revise working hours proposal to exclude Sundays</div>
              <div className="meta">We owe · due 12 Oct · agreed in E-3481</div>
            </div>
          </Reveal>
          <Reveal as="li" delay={0.18}>
            <span className="step" aria-hidden>04</span>
            <h3 className="mk-h4">Follow-up</h3>
            <p className="mk-small">Signals, an in-app inbox and a daily commitments digest make sure the right person sees it in time.</p>
            <div className="mk-ui mk-ui-pad" style={{ display: 'grid', gap: 6 }} aria-hidden>
              <div className="mk-ui-row"><HomeIcon size={14} color="var(--text-2)" /><span className="cap">Needs attention</span><span className="tag rule">Rule-based</span></div>
              <div className="ttl">C-176 is 11 days overdue</div>
              <div className="meta">Promised to Daria Zielinski · owner Tom Ashworth</div>
            </div>
          </Reveal>
        </ol>
        <Reveal className="mk-mt-l">
          <div className="mk-cards two">
            <Frame title="Decisions">
              <Shot name="decisions" display={590} crop={{ x: 600, y: 100, w: 840, h: 560 }} mobileCrop={{ x: 993, y: 100, w: 440, h: 600 }}
                alt="Decisions register with eight open decisions and D-107 open in a side panel: status Under review, needed by 29 October, decision owner, initiative, approvers and consulted stakeholders." />
            </Frame>
            <Frame title="Commitments">
              <Shot name="commitments" display={590} crop={{ x: 560, y: 100, w: 880, h: 586 }} mobileCrop={{ x: 993, y: 100, w: 440, h: 600 }}
                alt="Commitments register filtered to nine overdue commitments, with C-176 open in a side panel: overdue since 12 October, stakeholder, accountable owner, initiative and the engagement where it was agreed." />
            </Frame>
          </div>
          <SampleNote />
        </Reveal>
      </div>
    </section>
  )
}

/* ── 7 · Industry flexibility ─────────────────────────────────────────── */
const INDUSTRIES = TEMPLATES.filter(x => x.id !== 'other')
const kindLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1).replace('_', ' ')

export function Industries() {
  const [sel, setSel] = useState(INDUSTRIES.findIndex(x => x.id === 'construction'))
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const reduce = useReducedMotion()
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (sel + d + INDUSTRIES.length) % INDUSTRIES.length
    setSel(n); refs.current[n]?.focus()
  }
  const tpl = INDUSTRIES[sel]
  const v = tpl.vocabulary
  return (
    <div className="mk-ind">
      <div className="mk-ind-list" role="tablist" aria-label="Industry templates" aria-orientation="vertical" onKeyDown={onKey}>
        {INDUSTRIES.map((x, i) => (
          <button
            key={x.id} ref={el => { refs.current[i] = el }} role="tab" aria-selected={sel === i} tabIndex={sel === i ? 0 : -1}
            id={`ind-${x.id}`} aria-controls="ind-panel" className="mk-ind-btn" onClick={() => setSel(i)}
          >
            <b>{x.label}</b><ArrowRight size={16} aria-hidden />
            <span>{x.description}</span>
          </button>
        ))}
      </div>
      <div id="ind-panel" role="tabpanel" aria-labelledby={`ind-${tpl.id}`} aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tpl.id} initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0, transition: t.base }} exit={{ opacity: 0, transition: t.exit }}>
            <div className="mk-ws">
              <div className="mk-ws-side">
                <div className="wsname"><i aria-hidden>◎</i>Your workspace</div>
                <span className="it"><HomeIcon size={15} aria-hidden />Home</span>
                <span className="it"><Users size={15} aria-hidden />{v.stakeholder}s</span>
                <span className="it"><Building2 size={15} aria-hidden />{v.organization}s</span>
                <span className="it on"><Target size={15} aria-hidden />{v.initiative}s</span>
                <span className="it x"><MessagesSquare size={15} aria-hidden />Engagements</span>
                <span className="it x"><Scale size={15} aria-hidden />Decisions</span>
                <span className="it x"><Handshake size={15} aria-hidden />Commitments</span>
                <span className="sec">{v.initiative}s</span>
                <span className="it x"><span className="mk-mono" style={{ fontSize: 10.5 }}>{tpl.examples.initiativeCode}</span>{tpl.examples.initiative}</span>
              </div>
              <div className="mk-ws-main">
                <span className="crumb">{v.initiative}s / {tpl.examples.initiativeCode}</span>
                <h4>{tpl.examples.initiative}</h4>
                <div>
                  <p className="cap" style={{ font: 'var(--text-caption)', color: 'var(--text-2)', marginBottom: 8 }}>Engagement types, in order</p>
                  <div className="mk-ws-chips">{tpl.engagementKinds.filter(k => k !== 'other').map(k => <span key={k} className="mk-ws-chip">{kindLabel(k)}</span>)}</div>
                </div>
                <div className="mk-ws-table">
                  <div><span>{v.stakeholder}</span><span>{v.organization}</span></div>
                  {tpl.examples.stakeholderTitles.map((s, i) => (
                    <div key={s}><span>{s}</span><span>{tpl.examples.organizations[i % tpl.examples.organizations.length]}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <p className="mk-sample" style={{ justifyContent: 'flex-start' }}>Example labels from the {tpl.label.toLowerCase()} template. You can rename them later.</p>
      </div>
    </div>
  )
}

function IndustrySection() {
  return (
    <section className="mk-section alt" aria-labelledby="ind-title">
      <div className="mk-wrap">
        <Reveal className="mk-head split">
          <Eyebrow n="06">Industry templates</Eyebrow>
          <h2 id="ind-title" className="mk-h2">One platform. <em>Your vocabulary.</em></h2>
          <p className="mk-body" style={{ fontSize: 17, lineHeight: '28px' }}>
            Start from a template for your sector and Meridian speaks your language: a Project, a Client, a Programme.
            The product underneath is the same, so nothing is missing when your work changes.
          </p>
        </Reveal>
        <Reveal><Industries /></Reveal>
      </div>
    </section>
  )
}

/* ── 8 · Security & trust ─────────────────────────────────────────────── */
export const TRUST = [
  { icon: Database, h: 'Tenant isolation', p: 'PostgreSQL row-level security on every customer table, plus application checks. Cross-tenant access is covered by automated tests.' },
  { icon: KeyRound, h: 'Careful authentication', p: 'Verified email before use, hashed passwords, single-use reset links that expire in an hour, sessions that end after 7 idle days.' },
  { icon: Users, h: 'Least privilege', p: 'Five roles enforced on the server, billing controls for owners only, and restricted stakeholders on Professional.' },
  { icon: ScrollText, h: 'Audit log', p: 'Sign-ins, membership, role, billing and data-management events are recorded (Professional and above).' },
  { icon: CreditCard, h: 'Payments kept separate', p: 'Card details go only to the payment provider’s hosted checkout. Billing webhooks are signature-verified.' },
  { icon: FileSearch, h: 'AI data handling', p: 'AI usage logs store counts and cost, never prompts or answers. Copilot history retention can be set to zero.' },
]
function Trust() {
  return (
    <section className="mk-section" aria-labelledby="trust-title">
      <div className="mk-wrap">
        <Reveal className="mk-head split">
          <Eyebrow n="07">Security & trust</Eyebrow>
          <h2 id="trust-title" className="mk-h2">You’re recording people. <em>We take that seriously.</em></h2>
          <p className="mk-body" style={{ fontSize: 17, lineHeight: '28px' }}>
            These controls are implemented and tested today. We describe them plainly so your security team can judge them on their merits.
          </p>
        </Reveal>
        <ul className="mk-trust">
          {TRUST.map((x, i) => (
            <Reveal as="li" key={x.h} delay={(i % 3) * 0.05}>
              <x.icon size={20} className="ic" aria-hidden />
              <h3 className="mk-h4">{x.h}</h3>
              <p className="mk-small" style={{ fontSize: 14.5 }}>{x.p}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal className="mk-note">
          <span className="ic"><BadgeCheck size={20} aria-hidden /></span>
          <p><b>We don’t hold certifications yet.</b> Rather than borrow badges, we list exactly what is built. Single sign-on is planned for Enterprise, and multi-factor authentication isn’t available yet.</p>
          <MoreLink to="/security">Security details</MoreLink>
        </Reveal>
      </div>
    </section>
  )
}

/* ── 9 · Pricing ──────────────────────────────────────────────────────── */
function Pricing() {
  return (
    <section className="mk-section alt" aria-labelledby="pricing-title">
      <div className="mk-wrap">
        <Reveal className="mk-head center">
          <Eyebrow n="08">Plans</Eyebrow>
          <h2 id="pricing-title" className="mk-h2">Start with a trial. <em>Grow at your pace.</em></h2>
          <p className="mk-lede" style={{ marginInline: 'auto' }}>Three plans, billed monthly or annually. Public prices aren’t published yet, so we’ll quote for your team.</p>
        </Reveal>
        <Reveal><PlanCards compact /></Reveal>
        <TrialTerms />
        <p className="mk-center mk-mt-m"><MoreLink to="/pricing">Compare plans in detail</MoreLink></p>
      </div>
    </section>
  )
}

export function MarketingHome() {
  usePageMeta(
    'Meridian — Stakeholder intelligence workspace',
    'Meridian keeps stakeholders, relationships, engagements, decisions and commitments in one workspace, with rule-based signals and quote-backed AI proposals.',
  )
  return (
    <SiteLayout>
      <Hero />
      <Problem />
      <Solution />
      <Universe />
      <Intelligence />
      <Workflow />
      <IndustrySection />
      <Trust />
      <Pricing />
      <CtaBand />
    </SiteLayout>
  )
}

