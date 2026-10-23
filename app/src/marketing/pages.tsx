// Public marketing pages. Every claim here is drawn from docs/commercial/product-facts.md.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bell, BrainCircuit, Building2, Check, Clock, Database, Download, FileText, Fingerprint, Grid2x2, Handshake,
  Home as HomeIcon, KeyRound, LockKeyhole, MessagesSquare, Network, Radar, Route, Scale, ScrollText, ShieldCheck, Trash2, Users, Waypoints,
} from 'lucide-react'
import { SiteLayout } from './Layout'
import { CtaBand, Eyebrow, Frame, MoreLink, PageHero, Pin, Reveal, SampleNote, Shot, TrialCTAs, usePageMeta, type Crop } from './parts'
import { AITabs, TRUST } from './home'

export { MarketingHome } from './home'
export { PricingPage } from './pricing'
export { ContactPage } from './contact'

/* ── Shared page pieces ───────────────────────────────────────────────── */
type ShotSpec = { name: string; crop?: Crop; mobileCrop?: Crop; alt: string; frame: string }

function Feature({ id, eyebrow, title, body, points, shot, float, flip, children }: {
  id?: string; eyebrow: string; title: ReactNode; body: ReactNode; points?: ReactNode[]; shot: ShotSpec; float?: ShotSpec; flip?: boolean; children?: ReactNode
}) {
  return (
    <div id={id} className={`mk-split ${flip ? 'flip' : ''}`} style={{ scrollMarginTop: 96 }}>
      <Reveal className="mk-split-copy">
        <Eyebrow plain>{eyebrow}</Eyebrow>
        <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 3.2vw, 42px)' }}>{title}</h2>
        <div className="mk-body">{body}</div>
        {points && <ul className="mk-checks">{points.map((p, i) => <li key={i}><Check size={16} aria-hidden /><span>{p}</span></li>)}</ul>}
        {children}
      </Reveal>
      <Reveal delay={0.06}>
        <div className="mk-visual" style={float ? { paddingBottom: '8%' } : undefined}>
          <Frame title={shot.frame}><Shot name={shot.name} crop={shot.crop} mobileCrop={shot.mobileCrop} alt={shot.alt} display={700} /></Frame>
          {float && (
            <div className="float-a">
              <Frame float title={float.frame}><Shot name={float.name} crop={float.crop} alt={float.alt} display={420} /></Frame>
            </div>
          )}
        </div>
      </Reveal>
    </div>
  )
}

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gap: 'clamp(96px, 12vw, 160px)' }}>{children}</div>
}

function FactGroup({ icon: Icon, title, intro, items }: { icon: typeof Check; title: string; intro?: string; items: [string, string][] }) {
  return (
    <Reveal className="mk-facts">
      <div className="mk-facts-h">
        <Icon size={22} className="ic" aria-hidden />
        <h2 className="mk-h3">{title}</h2>
        {intro && <p className="mk-small">{intro}</p>}
      </div>
      <ul>{items.map(([b, s]) => <li key={b}><b>{b}</b><span>{s}</span></li>)}</ul>
    </Reveal>
  )
}

const NOT_YET: [string, string?][] = [
  ['SSO / SAML / SCIM', 'Planned for Enterprise'], ['Multi-factor authentication'], ['Mobile apps'],
  ['Integrations (Outlook, Gmail, Slack, CRM)'], ['Public API'], ['Custom fields'], ['Audio transcription'],
  ['Real-time co-editing'], ['Choice of data residency'], ['Uptime SLA'],
]

function NotYet({ items = NOT_YET }: { items?: [string, string?][] }) {
  return (
    <ul className="mk-notyet">
      {items.map(([a, b]) => <li key={a}><span>{a}</span>{b ? <span className="mk-planned">{b === 'Planned for Enterprise' ? 'Planned' : b}</span> : <span className="mk-planned">Not yet</span>}</li>)}
    </ul>
  )
}

/* ── /product ─────────────────────────────────────────────────────────── */
export function ProductPage() {
  usePageMeta('Product — Meridian', 'A tour of Meridian: the Command Center, stakeholder directory, relationship map, engagements, decisions, commitments, AI and team controls.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Product"
        title={<>The whole picture, <em>in one place.</em></>}
        lede="Meridian is a workspace for the people your work depends on: who they are, how they connect, what you discussed, what was decided and what was promised."
      >
        <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }}><TrialCTAs /></div>
      </PageHero>
      <section className="mk-section" style={{ paddingTop: 0 }} aria-label="Product overview">
        <div className="mk-wrap">
          <Reveal>
            <Frame title="Stakeholders · Westshire Infrastructure">
              <Shot name="stakeholders" priority display={1200} mobileCrop={{ x: 240, y: 100, w: 640, h: 500 }}
                alt="Stakeholder directory with 184 people: name and title, organization, stance badge, influence and interest meters, 26-week activity sparkline, last engaged, open items and relationship owner, with filters for stance, influence, initiative and engagement." />
            </Frame>
            <SampleNote />
          </Reveal>
        </div>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }} aria-label="Product tour">
        <div className="mk-wrap">
          <Stack>
            <Feature
              id="command-center" eyebrow="Command Center"
              title={<>Start each day knowing <em>what needs you.</em></>}
              body={<p>Home gathers rule-based signals from across the workspace. Each one says why it was flagged, which rule raised it, the evidence, and a suggested next step.</p>}
              points={['Overdue and due-soon commitments, decisions waiting', 'Cooling relationships and stance shifts', 'High-influence stakeholders with no owner', 'Unassigned and repeatedly delayed commitments']}
              shot={{ name: 'home-signal', crop: { x: 232, y: 56, w: 1208, h: 844 }, mobileCrop: { x: 248, y: 500, w: 800, h: 400 }, frame: 'Home', alt: 'Command Center with a Decision waiting signal expanded, showing why it matters, the rule, and a suggested next step.' }}
            >
              <div><MoreLink to="/stakeholder-intelligence">Stakeholder intelligence</MoreLink></div>
            </Feature>
            <Feature
              id="directory" eyebrow="Directory" flip
              title={<>A fast directory, <em>built for the keyboard.</em></>}
              body={<p>People with their role, organization, influence, stance, interest, owner and tags. Influence is recorded by your team on a 1–4 scale; Meridian never computes it.</p>}
              points={['Filter and sort a large table instantly', 'Jump anywhere with the ⌘K command palette', 'Profiles with history, relationships, commitments and decisions']}
              shot={{ name: 'palette', crop: { x: 232, y: 8, w: 1208, h: 884 }, mobileCrop: { x: 400, y: 126, w: 640, h: 440 }, frame: 'Command palette', alt: 'Command palette open over the Command Center with a search for “ellw” matching six stakeholders, each with title, organization and stance, plus an option to ask the copilot.' }}
            />
            <Feature
              id="organizations" eyebrow="Organizations and initiatives"
              title={<>Organized around <em>the work.</em></>}
              body={<p>Link stakeholders to the organizations they belong to and the initiatives they affect. Call initiatives what your team calls them, whether that is a Project, a Programme or a Client, as set by your industry template.</p>}
              shot={{ name: 'profile', crop: { x: 262, y: 70, w: 900, h: 640 }, mobileCrop: { x: 250, y: 70, w: 780, h: 460 }, frame: 'Fiona Ellwood', alt: 'Stakeholder profile for Fiona Ellwood with stance, influence, interest and initiative role, a cited briefing, a 52-week engagement chart, recent engagements and a mini network of six relationships.' }}
            />
            <Feature
              id="map" eyebrow="Relationship mapping" flip
              title={<>The network, <em>as your team recorded it.</em></>}
              body={<p>An interactive map of recorded relationships: reports to, influences, allied with, opposes and more. Switch to the influence grid, or find the shortest chain of recorded relationships between two people.</p>}
              shot={{ name: 'map', crop: { x: 470, y: 134, w: 780, h: 640 }, mobileCrop: { x: 480, y: 140, w: 720, h: 560 }, frame: 'Stakeholders · Map', alt: 'Network map of 86 people and 82 recorded relationships grouped by organization, with a stance legend.' }}
            >
              <div><MoreLink to="/relationship-mapping">Relationship mapping</MoreLink></div>
            </Feature>
            <Feature
              id="workflow" eyebrow="Engagements, decisions, commitments"
              title={<>From the meeting room <em>to the record.</em></>}
              body={<p>Log meetings, calls, emails, workshops, consultations, site visits and notes with participants. Track decisions through proposed, under review, then approved, rejected or deferred. Record commitments made by you or to you, with owners and due dates.</p>}
              points={['Approvers, consulted stakeholders and needed-by dates on every decision', 'Overdue tracking and the source engagement on every commitment']}
              shot={{ name: 'decisions', crop: { x: 600, y: 100, w: 840, h: 680 }, mobileCrop: { x: 993, y: 100, w: 440, h: 600 }, frame: 'Decisions', alt: 'Decisions register with eight open decisions; D-107 is open in a side panel showing status, needed-by date, owner, approvers and consulted stakeholders.' }}
              float={{ name: 'commitments', crop: { x: 993, y: 102, w: 440, h: 340 }, frame: 'C-176', alt: 'Commitment C-176, overdue since 12 October, with stakeholder, who owes, accountable owner, initiative and the engagement where it was agreed.' }}
            />
            <Feature
              id="ai" eyebrow="AI" flip
              title={<>Proposals you approve, <em>never surprises.</em></>}
              body={<p>Meeting intelligence proposes decisions, commitments and actions from notes or transcripts, each tied to a verbatim quote. Briefings and the copilot cite the records they draw on. AI features run on a built-in rules engine, or on a large language model when enabled.</p>}
              shot={{ name: 'intelligence', crop: { x: 232, y: 56, w: 1208, h: 844 }, mobileCrop: { x: 940, y: 200, w: 500, h: 560 }, frame: 'Meeting intelligence', alt: 'Meeting intelligence: highlighted source notes beside a review list of proposed decisions with quotes, Accept and Reject.' }}
            >
              <div><MoreLink to="/ai">How AI works in Meridian</MoreLink></div>
            </Feature>
          </Stack>
        </div>
      </section>
      <section className="mk-section alt" aria-labelledby="team-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Teams and data</Eyebrow>
            <h2 id="team-title" className="mk-h2">Built for teams, <em>with you in control.</em></h2>
          </Reveal>
          <div className="mk-cards four">
            {[
              { icon: Users, h: 'Roles', p: 'Owner, Administrator, Manager, Contributor and Viewer, enforced on the server.' },
              { icon: LockKeyhole, h: 'Restricted stakeholders', p: 'Sensitive records visible only to listed people and admins (Professional).' },
              { icon: Bell, h: 'Notifications', p: 'In-app inbox, daily commitments digest, decision assignments. Each can be switched off.' },
              { icon: Download, h: 'Your data', p: 'Full workspace export (JSON), personal data export, account closure and workspace deletion.' },
            ].map((x, i) => (
              <Reveal key={x.h} className="mk-card" delay={i * 0.05}>
                <span className="ic"><x.icon size={18} aria-hidden /></span>
                <h3 className="mk-h4">{x.h}</h3>
                <p>{x.p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}

/* ── /features ────────────────────────────────────────────────────────── */
export function FeaturesPage() {
  usePageMeta('Features — Meridian', 'Everything Meridian does today: stakeholder directory, relationship mapping, engagements, decisions, commitments, Command Center signals, AI, teams and data controls.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Features"
        title={<>Everything Meridian <em>does today.</em></>}
        lede="A complete list, written plainly. If something isn’t on this page, Meridian doesn’t do it yet, and we list the most-asked gaps at the end."
      >
        <nav className="mk-index" aria-label="Feature groups">
          <a href="#f-directory">Directory</a><a href="#f-map">Relationships</a><a href="#f-work">Engagements & decisions</a>
          <a href="#f-home">Command Center</a><a href="#f-ai">AI</a><a href="#f-teams">Teams</a><a href="#f-data">Data</a><a href="#f-notyet">Not yet available</a>
        </nav>
      </PageHero>
      <section className="mk-section" style={{ paddingTop: 0 }} aria-label="Feature list">
        <div className="mk-wrap">
          <div id="f-directory" />
          <FactGroup icon={Users} title="Stakeholder directory" intro="The people your work depends on, in one table." items={[
            ['People and roles', 'Role or title, organizations, owner and tags for every stakeholder.'],
            ['Influence, stance, interest', 'Influence on a 1–4 scale recorded by your team, not computed. Stance and interest alongside.'],
            ['Fast table', 'Filters and sorting across the whole directory.'],
            ['Command palette', 'A keyboard-first ⌘K palette to find people and jump anywhere.'],
          ]} />
          <FactGroup icon={Building2} title="Organizations and initiatives" items={[
            ['Organizations', 'Who stakeholders work for and with.'],
            ['Initiatives', 'Projects and programmes, with stakeholders linked to each.'],
            ['Your vocabulary', 'Rename initiatives and organizations per workspace, for example “Project” or “Client”, as set by your industry template.'],
            ['Industry templates', 'Technology, consulting, enterprise, government, construction and infrastructure, nonprofit and education.'],
          ]} />
          <div id="f-map" />
          <FactGroup icon={Network} title="Relationship mapping" items={[
            ['Network map', 'Interactive map of recorded relationships: reports to, influences, allied with, opposes and more.'],
            ['Influence grid', 'Influence against interest, with unassessed people listed separately.'],
            ['Find a path', 'The shortest chain of recorded relationships between two people, up to four steps.'],
            ['Profiles', 'Relationships, engagement history, commitments, decisions and history on each person.'],
          ]} />
          <div id="f-work" />
          <FactGroup icon={MessagesSquare} title="Engagements, decisions and commitments" items={[
            ['Engagements', 'Meetings, calls, emails, workshops, consultations, site visits and notes, with participants and notes.'],
            ['Decisions', 'Proposed, under review, then approved, rejected or deferred, with approvers, consulted stakeholders and needed-by dates.'],
            ['Commitments', 'Promises made by you or to you, with owners, due dates, overdue tracking and the source engagement.'],
          ]} />
          <div id="f-home" />
          <FactGroup icon={HomeIcon} title="Command Center" items={[
            ['Rule-based signals', 'Overdue, due soon, decisions waiting, cooling relationships, stance shifts, unowned high-influence stakeholders, unassigned and repeatedly delayed commitments.'],
            ['Explained', 'Each signal shows why it is flagged, the rule, the evidence and a suggested next step.'],
          ]} />
          <div id="f-ai" />
          <FactGroup icon={BrainCircuit} title="AI" intro="AI features run on a built-in rules engine, or on a large language model when enabled." items={[
            ['Meeting intelligence', 'Proposes decisions, commitments and actions from notes or transcripts (.txt, .md, .vtt, .srt). Every item is tied to a verbatim quote, and nothing is saved until a person accepts it.'],
            ['Briefings', 'Stakeholder (brief, detailed, meeting prep), decision and workspace briefings with facts, metrics and their method, and rule-based recommendations.'],
            ['Copilot (⌘J)', 'Answers from records you can access, with numbered citations.'],
            ['Safe imports', 'Instruction-like text in imported notes is flagged and ignored.'],
          ]} />
          <div id="f-teams" />
          <FactGroup icon={ShieldCheck} title="Teams and control" items={[
            ['Five roles', 'Owner, Administrator, Manager, Contributor and Viewer.'],
            ['Restricted stakeholders', 'Visible only to listed people and admins (Professional).'],
            ['Invitations', 'Email invitations with expiry, resend and revoke.'],
            ['Audit log', 'Security-relevant actions, on Professional and above.'],
            ['Notifications', 'In-app inbox, daily commitments digest, decision assignment and invitation accepted. Switch each off; one-click unsubscribe.'],
          ]} />
          <div id="f-data" />
          <FactGroup icon={Database} title="Your data" items={[
            ['Workspace export', 'Full workspace export (JSON) by admins.'],
            ['Personal data export', 'Any member can export their own data.'],
            ['Account closure', 'Close your account when you leave.'],
            ['Workspace deletion', 'By an owner, with a 14-day cooling-off period that can be cancelled.'],
          ]} />
        </div>
      </section>
      <section id="f-notyet" className="mk-section alt" aria-labelledby="notyet-title" style={{ scrollMarginTop: 64 }}>
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Being clear</Eyebrow>
            <h2 id="notyet-title" className="mk-h2">Not available yet</h2>
            <p className="mk-body">We’d rather you hear it here than find out after you’ve signed up.</p>
          </Reveal>
          <Reveal><NotYet /></Reveal>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}

/* ── /stakeholder-intelligence ────────────────────────────────────────── */
const SIGNALS: [string, string, string][] = [
  ['var(--critical)', 'Overdue commitments', 'A promise has passed its due date.'],
  ['var(--attention)', 'Due soon', 'A commitment falls due in the coming days.'],
  ['var(--attention)', 'Decisions waiting', 'A decision is still proposed or under review close to, or after, its needed-by date.'],
  ['var(--slate-500)', 'Cooling relationships', 'Engagement with a key stakeholder has dropped compared with before.'],
  ['var(--slate-500)', 'Stance shifts', 'A stakeholder’s recorded stance has changed.'],
  ['var(--slate-500)', 'Unowned high-influence stakeholders', 'Someone your team rates as highly influential has no relationship owner.'],
  ['var(--slate-500)', 'Unassigned commitments', 'A commitment has no accountable owner.'],
  ['var(--slate-500)', 'Repeatedly delayed commitments', 'A commitment’s due date keeps moving.'],
]

export function StakeholderIntelligencePage() {
  usePageMeta('Stakeholder intelligence — Meridian', 'Rule-based signals, cited briefings and complete stakeholder profiles. Every signal shows why it was flagged, the rule, the evidence and a next step.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Stakeholder intelligence"
        title={<>Know what needs attention, <em>and why.</em></>}
        lede="Meridian reads your own records, not the internet, and turns them into signals, briefings and profiles. Every conclusion shows the evidence it rests on."
      >
        <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }}><TrialCTAs /></div>
      </PageHero>
      <section className="mk-section" style={{ paddingTop: 0 }} aria-labelledby="anatomy-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Anatomy of a signal</Eyebrow>
            <h2 id="anatomy-title" className="mk-h2">A flag you can <em>check.</em></h2>
          </Reveal>
          <Reveal style={{ maxWidth: 980, marginInline: 'auto' }}>
            <div style={{ position: 'relative' }}>
              <Frame title="Home · Needs attention">
                <Shot name="home-signal" crop={{ x: 264, y: 520, w: 770, h: 290 }} mobileCrop={{ x: 270, y: 600, w: 470, h: 210 }} display={980}
                  alt="An expanded Decision waiting signal for D-110 Design freeze for Brockley junction: why it matters (3 days past its decision date, proposed), labelled Rule-based, the rule text, a suggested next step with a Review decision button, and an Ask AI about this button." />
                <Pin n={1} x={2.6} y={37.2} />
                <Pin n={2} x={26.8} y={37.2} />
                <Pin n={3} x={2.6} y={51} />
                <Pin n={4} x={96.6} y={64} />
              </Frame>
            </div>
            <SampleNote />
          </Reveal>
          <ol className="mk-legend four">
            {[
              ['Why it matters', 'The situation in plain words: here, three days past its decision date and still proposed.'],
              ['Rule-based', 'Signals come from the rules engine, and say so. No model guesses what is urgent.'],
              ['The rule', 'The exact condition that raised the flag, so you can judge whether it applies.'],
              ['Suggested next step', 'One action that opens the right record or form. It never runs on its own.'],
            ].map(([b, p], i) => (
              <Reveal as="li" key={b} delay={i * 0.04}><span className="n" aria-hidden>{i + 1}</span><div><b>{b}</b><p>{p}</p></div></Reveal>
            ))}
          </ol>
        </div>
      </section>
      <section className="mk-section alt" aria-labelledby="signals-title">
        <div className="mk-wrap">
          <Reveal className="mk-head split">
            <Eyebrow plain>The signals</Eyebrow>
            <h2 id="signals-title" className="mk-h2">Eight rules, <em>watching every record.</em></h2>
            <p className="mk-body">Each one is a plain rule over your records. When it fires, the Command Center shows the rule and the evidence alongside it.</p>
          </Reveal>
          <ul className="mk-signals">
            {SIGNALS.map(([c, b, s], i) => (
              <Reveal as="li" key={b} delay={(i % 2) * 0.04}><i style={{ background: c }} aria-hidden /><div><b>{b}</b><span>{s}</span></div></Reveal>
            ))}
          </ul>
        </div>
      </section>
      <section className="mk-section" aria-label="Briefings and profiles">
        <div className="mk-wrap">
          <Stack>
            <Feature
              eyebrow="Briefings"
              title={<>Walk into every meeting <em>prepared.</em></>}
              body={<p>Generate a stakeholder briefing at three depths (brief, detailed or meeting prep), or a briefing on a decision or the whole workspace. Each one combines recorded facts, metrics with their method, and rule-based recommendations, with a citation on every line.</p>}
              points={['With a model configured, a cited AI interpretation is added and clearly marked']}
              shot={{ name: 'briefing-prep', crop: { x: 440, y: 60, w: 780, h: 720 }, mobileCrop: { x: 460, y: 260, w: 700, h: 560 }, frame: 'Fiona Ellwood · Briefing', alt: 'Meeting prep briefing for Fiona Ellwood with talking points, context and recent engagement, each line cited, produced by the built-in rules engine.' }}
            />
            <Feature
              flip eyebrow="Profiles"
              title={<>Everything about a stakeholder, <em>on one page.</em></>}
              body={<p>Stance, influence and interest; the relationship owner; when you last engaged; a 52-week engagement history; recorded relationships; and the commitments and decisions that involve them.</p>}
              shot={{ name: 'profile', crop: { x: 262, y: 70, w: 900, h: 640 }, mobileCrop: { x: 250, y: 290, w: 780, h: 520 }, frame: 'Fiona Ellwood', alt: 'Stakeholder profile for Fiona Ellwood with a cited briefing, an engagement chart, recent engagements and a network of six relationships.' }}
            />
            <Feature
              eyebrow="Copilot"
              title={<>Ask in plain language. <em>See the sources.</em></>}
              body={<p>Press ⌘J and ask about stakeholders, commitments or decisions. The copilot answers only from records you can access, with numbered citations to each one.</p>}
              shot={{ name: 'copilot', crop: { x: 700, y: 8, w: 740, h: 884 }, mobileCrop: { x: 1012, y: 8, w: 428, h: 560 }, frame: 'Copilot', alt: 'Copilot answer listing overdue commitments with a numbered list of source records.' }}
            >
              <div><MoreLink to="/ai">More about AI in Meridian</MoreLink></div>
            </Feature>
          </Stack>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}

/* ── /relationship-mapping ────────────────────────────────────────────── */
export function RelationshipMappingPage() {
  usePageMeta('Relationship mapping — Meridian', 'An interactive map of recorded relationships, an influence grid, and the shortest path between two people through recorded relationships.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Relationship mapping"
        title={<>Map the relationships <em>your team has recorded.</em></>}
        lede="Who reports to whom, who influences whom, who is allied and who opposes. Meridian draws the network from what your team records, and is careful never to claim more than that."
      >
        <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }}><TrialCTAs /></div>
      </PageHero>
      <section className="mk-section" style={{ paddingTop: 0 }} aria-label="Map">
        <div className="mk-wrap">
          <Reveal>
            <Frame title="Stakeholders · Map">
              <Shot name="map-selected" priority display={1200} mobileCrop={{ x: 470, y: 102, w: 720, h: 640 }}
                alt="Relationship map of 184 people and 324 relationships with Fiona Ellwood selected: her six relationships are highlighted while the rest of the network fades, and a side panel lists stance, influence, interest, owner, engagement and relationships." />
            </Frame>
            <SampleNote />
          </Reveal>
        </div>
      </section>
      <section className="mk-section alt" aria-labelledby="lenses-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Three lenses</Eyebrow>
            <h2 id="lenses-title" className="mk-h2">The same people, <em>three ways.</em></h2>
          </Reveal>
          <div className="mk-cards">
            <Reveal className="mk-card">
              <span className="ic"><Network size={18} aria-hidden /></span>
              <h3 className="mk-h4">Network</h3>
              <p>Recorded relationships, grouped by organization. Select someone to see their details beside the map.</p>
              <div className="crop"><Shot name="map" crop={{ x: 500, y: 150, w: 660, h: 440 }} alt="Close-up of organization clusters in the network map." display={340} /></div>
            </Reveal>
            <Reveal className="mk-card" delay={0.05}>
              <span className="ic"><Grid2x2 size={18} aria-hidden /></span>
              <h3 className="mk-h4">Influence grid</h3>
              <p>Influence against interest, in four quadrants. People your team hasn’t assessed are listed below the grid rather than guessed into a cell.</p>
              <div className="crop" aria-hidden style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--mk-line)', aspectRatio: '660 / 440' }}>
                {['Keep satisfied', 'Manage closely', 'Monitor', 'Keep informed'].map(q => (
                  <div key={q} style={{ background: '#fff', display: 'grid', placeItems: 'center', font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-2)' }}>{q}</div>
                ))}
              </div>
            </Reveal>
            <Reveal className="mk-card" delay={0.1}>
              <span className="ic"><Route size={18} aria-hidden /></span>
              <h3 className="mk-h4">Find a path</h3>
              <p>Choose two people to see the shortest chain of recorded relationships between them, up to four steps.</p>
              <div className="crop"><Shot name="map-path" crop={{ x: 247, y: 115, w: 364, h: 156 }} alt="Find a path panel with From and To stakeholder pickers." display={340} /></div>
            </Reveal>
          </div>
        </div>
      </section>
      <section className="mk-section" aria-labelledby="honest-title">
        <div className="mk-wrap">
          <div className="mk-split">
            <Reveal className="mk-split-copy">
              <Eyebrow plain>Respectful by design</Eyebrow>
              <h2 id="honest-title" className="mk-h2" style={{ fontSize: 'clamp(28px, 3.2vw, 42px)' }}>A map of records, <em>not a judgement of people.</em></h2>
              <ul className="mk-checks">
                <li><Check size={16} aria-hidden /><span><b>Influence is recorded, not computed.</b> Your team rates it on a 1–4 scale and the map shows it as node size.</span></li>
                <li><Check size={16} aria-hidden /><span><b>Paths show connections, not power.</b> Find a path shows how people are linked in your records; it doesn’t measure influence.</span></li>
                <li><Check size={16} aria-hidden /><span><b>Stance is never colour alone.</b> Opposed, concerned, neutral, supporter and champion always carry a label or shape.</span></li>
                <li><Check size={16} aria-hidden /><span><b>Sensitive people can be restricted</b> to listed colleagues and admins (Professional).</span></li>
              </ul>
            </Reveal>
            <Reveal delay={0.06} style={{ maxWidth: 420, width: '100%', justifySelf: 'center' }}>
              <Frame title="Fiona Ellwood · Network">
                <Shot name="profile" crop={{ x: 1050, y: 302, w: 340, h: 336 }} mobileCrop={{ x: 1050, y: 302, w: 340, h: 336 }} display={640}
                  alt="Mini network on a stakeholder profile: Fiona Ellwood at the centre with six connected people, a legend for formal, influence and opposes relationships, and an Open in map link." />
              </Frame>
            </Reveal>
          </div>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}

/* ── /ai ──────────────────────────────────────────────────────────────── */
export function AIPage() {
  usePageMeta('AI — Meridian', 'Meeting intelligence with quote-backed proposals and human approval, cited briefings and a copilot. Runs on a built-in rules engine, or a large language model when enabled.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="AI in Meridian"
        title={<>AI that proposes. <em>People decide.</em></>}
        lede="AI features run on a built-in rules engine, or on a large language model when enabled. Either way, every output cites its sources, says which engine produced it, and waits for a person before anything is saved."
      >
        <div style={{ display: 'grid', gap: 14, justifyItems: 'start' }}><TrialCTAs /></div>
      </PageHero>
      <section className="mk-section dark" aria-labelledby="ai-tabs-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Three capabilities</Eyebrow>
            <h2 id="ai-tabs-title" className="mk-h2">Meetings, briefings, <em>questions.</em></h2>
          </Reveal>
          <Reveal><AITabs /></Reveal>
        </div>
      </section>
      <section className="mk-section" aria-labelledby="mi-title">
        <div className="mk-wrap">
          <Reveal className="mk-head split">
            <Eyebrow plain>Meeting intelligence, step by step</Eyebrow>
            <h2 id="mi-title" className="mk-h2">Every proposal <em>has a quote.</em></h2>
            <p className="mk-body">Load notes or a transcript into an engagement. Meridian highlights what it found and proposes records for you to review.</p>
          </Reveal>
          <div className="mk-cards four">
            {[
              { icon: FileText, h: 'Bring the notes', p: 'Load meeting notes or a transcript (.txt, .md, .vtt or .srt). Audio transcription isn’t available.' },
              { icon: ScrollText, h: 'See the source', p: 'Stated items, inferred items and open questions are underlined differently in the notes.' },
              { icon: Scale, h: 'Review proposals', p: 'Decisions, commitments and actions, each with the verbatim quote it came from.' },
              { icon: Handshake, h: 'Accept or reject', p: 'Nothing is saved until a person accepts it. Rejecting only dismisses the suggestion.' },
            ].map((x, i) => (
              <Reveal key={x.h} className="mk-card" delay={i * 0.05}>
                <span className="ic"><x.icon size={18} aria-hidden /></span>
                <h3 className="mk-h4">{x.h}</h3>
                <p>{x.p}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="mk-mt-l">
            <Frame title="Engagement · Meeting intelligence">
              <Shot name="intelligence" display={1200} mobileCrop={{ x: 260, y: 230, w: 640, h: 560 }}
                alt="Meeting intelligence for an engagement: the notes with highlighted passages, a warning that an instruction-like passage was treated as content, and a review panel of proposed decisions with quotes and Accept buttons." />
            </Frame>
            <SampleNote />
          </Reveal>
        </div>
      </section>
      <section className="mk-section alt" aria-labelledby="engines-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Engines and data</Eyebrow>
            <h2 id="engines-title" className="mk-h2">Know what produced it, <em>and where your data went.</em></h2>
          </Reveal>
          <div className="mk-cards two">
            <Reveal className="mk-card">
              <span className="ic"><Radar size={18} aria-hidden /></span>
              <h3 className="mk-h4">Built-in rules engine</h3>
              <p>Available in every workspace. It works only on your records, and no data is sent anywhere. Its output is labelled “Built-in rules engine”.</p>
            </Reveal>
            <Reveal className="mk-card" delay={0.05}>
              <span className="ic" style={{ background: 'var(--ai-subtle)', color: 'var(--ai)' }}><BrainCircuit size={18} aria-hidden /></span>
              <h3 className="mk-h4">Claude model, when configured</h3>
              <p>When the operator of your Meridian deployment configures a Claude model, briefings gain a cited AI interpretation. Model output is always marked as AI.</p>
            </Reveal>
          </div>
          <ul className="mk-trust mk-mt-l">
            {[
              { icon: Fingerprint, h: 'Instruction-like text is ignored', p: 'If imported notes contain text that reads like a command to an AI, it is flagged, kept visible in the source, and nothing is extracted from it.' },
              { icon: Database, h: 'Usage logs without content', p: 'AI usage logs store counts and cost, never prompts or answers.' },
              { icon: Clock, h: 'Retention you choose', p: 'Copilot history retention is configurable, including zero, so nothing is stored.' },
            ].map((x, i) => (
              <Reveal as="li" key={x.h} delay={i * 0.05}>
                <x.icon size={20} className="ic" aria-hidden />
                <h3 className="mk-h4">{x.h}</h3>
                <p className="mk-small">{x.p}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}

/* ── /security ────────────────────────────────────────────────────────── */
export function SecurityPage() {
  usePageMeta('Security — Meridian', 'The security controls implemented and tested in Meridian today, and what is not available yet. We don’t hold certifications yet.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Security"
        title={<>Security, <em>described plainly.</em></>}
        lede="Meridian holds information about real people, so we treat it carefully. Below is every control that is implemented and tested today, and what isn’t available yet."
      >
        <nav className="mk-index" aria-label="On this page">
          <a href="#s-overview">Overview</a><a href="#s-controls">Controls in detail</a><a href="#s-data">Your data</a><a href="#s-notyet">Not available yet</a>
        </nav>
      </PageHero>
      <section id="s-overview" className="mk-section" style={{ paddingTop: 0, scrollMarginTop: 64 }} aria-label="Overview">
        <div className="mk-wrap">
          <ul className="mk-trust">
            {TRUST.map((x, i) => (
              <Reveal as="li" key={x.h} delay={(i % 3) * 0.05}>
                <x.icon size={20} className="ic" aria-hidden />
                <h2 className="mk-h4">{x.h}</h2>
                <p className="mk-small" style={{ fontSize: 14.5 }}>{x.p}</p>
              </Reveal>
            ))}
          </ul>
          <Reveal className="mk-note">
            <span className="ic"><ShieldCheck size={20} aria-hidden /></span>
            <p><b>We don’t hold certifications yet.</b> Meridian has no SOC 2, ISO 27001, HIPAA or other certification today. We describe our controls instead of claiming badges.</p>
            <Link to="/contact?topic=security" className="mk-btn mk-btn-secondary mk-btn-sm">Ask a security question</Link>
          </Reveal>
        </div>
      </section>
      <section id="s-controls" className="mk-section alt" style={{ scrollMarginTop: 64 }} aria-labelledby="controls-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Controls in detail</Eyebrow>
            <h2 id="controls-title" className="mk-h2">Implemented <em>and tested.</em></h2>
          </Reveal>
          <FactGroup icon={Database} title="Tenant isolation" items={[
            ['Row-level security', 'PostgreSQL row-level security on every customer table.'],
            ['Application checks', 'Access is also checked in the application code.'],
            ['Tested', 'Cross-tenant access is covered by automated tests.'],
          ]} />
          <FactGroup icon={KeyRound} title="Authentication" items={[
            ['Hashed passwords', 'Passwords are hashed by the authentication library (Better Auth).'],
            ['Verified email', 'Email verification is required before an account can be used.'],
            ['Password resets', 'Reset links are single-use and expire after 1 hour.'],
            ['Sessions', 'Sessions expire after 7 days of inactivity, using secure, HTTP-only cookies in production.'],
          ]} />
          <FactGroup icon={Waypoints} title="Web and API protection" items={[
            ['Rate limiting', 'On the API, AI, invitation and contact endpoints.'],
            ['Security headers', 'Including a strict Content-Security-Policy in production.'],
          ]} />
          <FactGroup icon={Users} title="Least privilege and audit" items={[
            ['Server-enforced roles', 'Owner, Administrator, Manager, Contributor and Viewer permissions are enforced on the server.'],
            ['Owner-only billing', 'Only workspace owners can change billing.'],
            ['Restricted stakeholders', 'Visible only to listed people and admins (Professional).'],
            ['Audit log', 'Records sign-ins, membership, role, billing and data-management events (Professional and above).'],
          ]} />
          <FactGroup icon={LockKeyhole} title="Payments" items={[
            ['Hosted checkout', 'Card details are handled only by the payment provider’s hosted checkout. Meridian never sees or stores card numbers.'],
            ['Signed webhooks', 'Billing webhooks are signature-verified.'],
          ]} />
          <FactGroup icon={BrainCircuit} title="AI data handling" items={[
            ['Rules engine by default', 'The built-in rules engine sends no data anywhere.'],
            ['No content in usage logs', 'AI usage logs store counts and cost, never prompts or answers.'],
            ['Copilot retention', 'Configurable, including zero (no storage).'],
            ['Imported notes', 'Instruction-like text in imported notes is flagged and ignored.'],
          ]} />
        </div>
      </section>
      <section id="s-data" className="mk-section" style={{ scrollMarginTop: 64 }} aria-labelledby="data-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Your data</Eyebrow>
            <h2 id="data-title" className="mk-h2">Yours to take, <em>yours to delete.</em></h2>
          </Reveal>
          <div className="mk-cards four">
            {[
              { icon: Download, h: 'Workspace export', p: 'Admins can download a full workspace export in JSON.' },
              { icon: FileText, h: 'Personal data export', p: 'Any member can export their own personal data.' },
              { icon: Trash2, h: 'Workspace deletion', p: 'By an owner, with a 14-day cooling-off period that can be cancelled.' },
              { icon: Clock, h: 'After cancellation', p: 'Nothing is deleted by cancelling. The workspace is read-only for 90 days so you can export.' },
            ].map((x, i) => (
              <Reveal key={x.h} className="mk-card" delay={i * 0.05}>
                <span className="ic"><x.icon size={18} aria-hidden /></span>
                <h3 className="mk-h4">{x.h}</h3>
                <p>{x.p}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section id="s-notyet" className="mk-section alt" style={{ scrollMarginTop: 64 }} aria-labelledby="sec-notyet-title">
        <div className="mk-wrap">
          <Reveal className="mk-head">
            <Eyebrow plain>Not available yet</Eyebrow>
            <h2 id="sec-notyet-title" className="mk-h2">What we don’t offer <em>today.</em></h2>
            <p className="mk-body">If any of these are requirements for you, tell us. It helps us decide what to build next.</p>
          </Reveal>
          <Reveal>
            <NotYet items={[
              ['SSO / SAML / SCIM', 'Planned for Enterprise'], ['Multi-factor authentication'], ['SOC 2, ISO 27001 or other certifications'],
              ['Choice of data residency'], ['Uptime SLA'], ['Public API'],
            ]} />
          </Reveal>
          <p className="mk-mt-m"><Link to="/contact?topic=security" className="mk-link">Contact us about security <ArrowRight size={15} aria-hidden /></Link></p>
        </div>
      </section>
      <CtaBand />
    </SiteLayout>
  )
}

