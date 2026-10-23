import { motion, AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Mail, Maximize2, X } from 'lucide-react'
import { useOverview } from '../../api/hooks'
import { Avatar, Button, Kbd, LevelMeter, Skeleton, StanceBadge } from '../../components/ui'
import { MOD } from '../../lib/hotkeys'
import { t } from '../../lib/motion'
import { daysFromToday, fmtDate, fmtRelative, isOpenStatus, LEVEL_LABEL, RELATIONSHIP_LABEL } from '../../lib/format'
import { LoadError } from '../Home'
import './peek.css'

const DAY = 86_400_000

/** Right-hand peek panel. Overlays the list (no reflow) and follows J/K focus. */
export function PeekPanel({ id, onClose, context = 'list', note }: { id: string; onClose: () => void; context?: 'list' | 'map'; note?: string }) {
  const nav = useNavigate()
  const ov = useOverview(id)
  const d = ov.data && ov.data.stakeholder.id === id ? ov.data : null
  const s = d?.stakeholder
  const org = s?.organizations.find(o => !o.validTo && o.isPrimary) ?? s?.organizations.find(o => !o.validTo)
  const now = Date.now()
  const recent = d?.engagements.filter(e => now - Date.parse(e.occurredAt) <= 60 * DAY).length ?? 0
  const prior = d?.engagements.filter(e => { const x = now - Date.parse(e.occurredAt); return x > 60 * DAY && x <= 120 * DAY }).length ?? 0
  const open = d?.commitments.filter(c => isOpenStatus(c.status)).slice(0, 3) ?? []
  const rels = (d?.relationships ?? []).slice().sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)).slice(0, 6)

  return (
    <motion.aside className="peek" aria-label={s ? `${s.name} preview` : 'Stakeholder preview'} aria-busy={!d || undefined}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, transition: t.panel }} exit={{ opacity: 0, x: 16, transition: t.exit }}>
      <div className="peek-bar">
        <span className="t-caption c3">Stakeholder</span>
        <span className="grow" />
        <Button size="sm" variant="ghost" icon={<Maximize2 size={13} />} onClick={() => nav(`/stakeholders/${id}`)} title={`Open full profile (${MOD}↵)`} aria-label="Open full profile" />
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onClose} aria-label="Close preview (Esc)" title="Close (Esc)" />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={d ? id : 'loading'} className="peek-body" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
          {ov.isError ? <LoadError error={ov.error} onRetry={() => ov.refetch()} /> : !s ? <PeekSkeleton /> : (
            <>
              <div className="peek-id">
                <motion.div layoutId={`avatar-${s.id}`} transition={t.panel}><Avatar name={s.name} size={40} /></motion.div>
                <div className="grow">
                  <h2 className="t-title truncate">{s.name}</h2>
                  <p className="c2 truncate">{[s.title, org?.name].filter(Boolean).join(' · ') || <span className="c3">No role recorded</span>}</p>
                </div>
              </div>
              {note && <p className="peek-note t-small">{note}</p>}
              <dl className="peek-facts">
                <div><dt>Stance</dt><dd><StanceBadge stance={s.stance} /></dd></div>
                <div><dt>Influence</dt><dd className="row gap-2">{s.influence ? <><LevelMeter value={s.influence} label="Influence" />{LEVEL_LABEL[s.influence]}</> : <span className="c3">Not assessed</span>}</dd></div>
                <div><dt>Interest</dt><dd className="row gap-2">{s.interest ? <><LevelMeter value={s.interest} label="Interest" />{LEVEL_LABEL[s.interest]}</> : <span className="c3">Not assessed</span>}</dd></div>
                <div><dt>Owner</dt><dd className="row gap-2">{s.owner ? <><Avatar name={s.owner.name} size={18} internal />{s.owner.name}</> : <span className="c3">Unassigned</span>}</dd></div>
                <div><dt>Engagement</dt><dd className="num">{recent} in last 60 days <span className="c3">· {prior} prior</span></dd></div>
                <div><dt>Contact</dt><dd className="row gap-2 truncate">{s.email ? <><Mail size={13} className="c3" /><a className="inline-link truncate" href={`mailto:${s.email}`}>{s.email}</a></> : <span className="c3">—</span>}</dd></div>
              </dl>
              {open.length > 0 && (
                <section className="peek-sec">
                  <h3 className="label-rule">Open commitments</h3>
                  {open.map(c => (
                    <div key={c.id} className="peek-commit">
                      <span className="mono c3">{c.key}</span>
                      <span className="grow truncate">{c.title}</span>
                      <span className={`t-small num ${c.dueDate && daysFromToday(c.dueDate) < 0 ? 'is-overdue' : 'c2'}`}>{fmtDate(c.dueDate)}</span>
                    </div>
                  ))}
                </section>
              )}
              <section className="peek-sec">
                <h3 className="label-rule">Relationships <span className="num">{d.relationships.length}</span></h3>
                {rels.length === 0 && <p className="c3 t-small">No relationships recorded.</p>}
                {rels.map(r => (
                  <button key={r.id} className="peek-rel" onClick={() => nav(r.otherKind === 'stakeholder' ? `/stakeholders/${r.other.id}` : `/organizations/${r.other.id}`)}>
                    <span className="rel-type">{(RELATIONSHIP_LABEL[r.type] ?? ['Related to', 'Related to'])[r.direction === 'out' ? 0 : 1]}</span>
                    <Avatar name={r.other.name} size={18} />
                    <span className="truncate grow">{r.other.name}{r.status === 'inferred' && <span className="c3 t-small"> · inferred</span>}</span>
                    {r.strength && <span className="rel-strength" role="img" aria-label={`Strength ${r.strength} of 3`}>{[1, 2, 3].map(i => <i key={i} data-on={i <= r.strength! || undefined} />)}</span>}
                  </button>
                ))}
              </section>
              <section className="peek-sec">
                <h3 className="label-rule">Recent engagement</h3>
                {d.engagements.length === 0 && <p className="c3 t-small">No engagement recorded yet.</p>}
                <ol className="peek-tl">
                  {d.engagements.slice(0, 4).map(e => (
                    <li key={e.id}>
                      <span className="tl-dot" />
                      <div className="grow">
                        <div className="row gap-2"><button className="t-strong truncate inline-link-plain" onClick={() => nav(`/engagements/${e.id}`)}>{e.title}</button><span className="grow" /><span className="c3 t-small num">{fmtRelative(e.occurredAt)}</span></div>
                        {e.summary && <p className="c2 t-small">{e.summary}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="peek-foot">
        <Button variant="primary" size="sm" onClick={() => nav(`/stakeholders/${id}`)} icon={<ArrowUpRight size={14} />}>Open profile <Kbd>↵</Kbd></Button>
        <span className="grow" />
        {context === 'list'
          ? <span className="t-small c3"><Kbd>J</Kbd> <Kbd>K</Kbd> next / previous</span>
          : <span className="t-small c3"><Kbd>←</Kbd> <Kbd>→</Kbd> nearest neighbour</span>}
      </div>
    </motion.aside>
  )
}

function PeekSkeleton() {
  return (
    <div className="peek-skel" aria-hidden>
      <div className="row gap-3"><Skeleton w={40} h={40} r={20} /><div style={{ flex: 1, display: 'grid', gap: 8 }}><Skeleton w="60%" h={14} /><Skeleton w="80%" h={10} /></div></div>
      <div className="peek-facts">{Array.from({ length: 6 }, (_, i) => <div key={i} style={{ display: 'grid', gap: 6 }}><Skeleton w={60} h={9} /><Skeleton w={90} h={12} /></div>)}</div>
      <Skeleton w="40%" h={10} /><Skeleton h={10} /><Skeleton w="85%" h={10} /><Skeleton w="70%" h={10} />
    </div>
  )
}
