import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Network } from 'lucide-react'
import type { RelationshipView, StakeholderDetail } from '../../api/types'
import { RELATIONSHIP_LABEL, STANCE_LABEL } from '../../lib/format'
import { Button } from '../../components/ui'

const W = 320, H = 232, CX = W / 2, CY = H / 2
const TYPE_ORDER = ['reports_to', 'colleague', 'advises', 'allied', 'influences', 'opposes', 'member_of', 'partner_of', 'funds', 'regulates', 'other']
const DASH: Record<string, string | undefined> = { colleague: '1 3', influences: '4 3', opposes: '2 2' }
const STANCE_VAR: Record<string, string> = {
  opposed: 'var(--stance-opposed)', concerned: 'var(--stance-concerned)', neutral: 'var(--stance-neutral)',
  supporter: 'var(--stance-supporter)', champion: 'var(--stance-champion)', unknown: 'var(--stance-unknown)',
}

/** First-degree relationship preview. Keyboard: Tab through neighbours, Enter opens. */
export function EgoGraph({ s: me, relationships }: { s: StakeholderDetail; relationships: RelationshipView[] }) {
  const nav = useNavigate()
  const pid = me.id
  const [hover, setHover] = useState<string | null>(null)

  const nodes = useMemo(() => {
    const rels = relationships.slice()
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (b.strength ?? 0) - (a.strength ?? 0))
      .slice(0, 14)
    const n = rels.length
    return rels.map((r, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2
      const rad = 84 + (r.strength === 3 ? -10 : r.strength === 1 ? 10 : 0)
      const p = { id: r.other.id, name: r.other.name, stance: r.other.stance ?? 'unknown', isOrg: r.otherKind === 'organization' }
      return { r, p, x: CX + Math.cos(ang) * rad * 1.25, y: CY + Math.sin(ang) * rad * 0.92, size: 5 + (r.other.influence ?? 1) * 1.6 }
    })
  }, [relationships])
  const label = (r: RelationshipView) => (RELATIONSHIP_LABEL[r.type] ?? ['related to', 'related to'])[r.direction === 'out' ? 0 : 1].toLowerCase()
  const go = (n: typeof nodes[number]) => nav(n.p.isOrg ? `/organizations/${n.p.id}` : `/stakeholders/${n.p.id}`)

  const h = nodes.find(n => n.p.id === hover)

  if (!nodes.length) return <p className="c3 t-small card-empty">No relationships recorded. Add one from the Relationships tab.</p>

  return (
    <div className="ego">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label={`${me.name}'s relationships`}>
        {nodes.map((n, i) => (
          <motion.line
            key={n.r.id}
            strokeOpacity={n.r.status === 'inferred' ? 0.5 : 1}
            x1={CX} y1={CY} x2={n.x} y2={n.y}
            stroke={n.r.type === 'opposes' ? 'var(--stance-opposed)' : 'var(--slate-400)'}
            strokeWidth={(n.r.strength ?? 1) * 0.6 + 0.4}
            strokeDasharray={DASH[n.r.type]}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: hover && hover !== n.p.id ? 0.15 : 0.7, transition: { pathLength: { duration: 0.32, delay: 0.04 + i * 0.012, ease: [0.2, 0, 0, 1] }, opacity: { duration: 0.14 } } }}
          />
        ))}
        {nodes.map((n, i) => (
          <motion.g
            key={n.p.id}
            className="ego-node"
            tabIndex={0}
            role="link"
            aria-label={`${n.p.name}, ${label(n.r)}${n.p.isOrg ? ', organization' : `, ${STANCE_LABEL[n.p.stance]}`}`}
            onMouseEnter={() => setHover(n.p.id)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(n.p.id)} onBlur={() => setHover(null)}
            onClick={() => go(n)}
            onKeyDown={e => { if (e.key === 'Enter') go(n) }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: hover && hover !== n.p.id ? 0.35 : 1, scale: 1, transition: { duration: 0.24, delay: 0.08 + i * 0.012, ease: [0.2, 0, 0, 1] } }}
            style={{ transformOrigin: `${n.x}px ${n.y}px` }}
          >
            <circle cx={n.x} cy={n.y} r={n.size + 6} fill="transparent" />
            <circle cx={n.x} cy={n.y} r={n.size} fill="var(--bg-surface)" stroke={STANCE_VAR[n.p.stance]} strokeWidth={2} />
            <circle cx={n.x} cy={n.y} r={Math.max(1.5, n.size - 4)} fill={STANCE_VAR[n.p.stance]} opacity={0.18} />
            <text x={n.x} y={n.y + n.size + 11} textAnchor="middle" className="ego-label">{n.p.name.split(' ')[0]}</text>
          </motion.g>
        ))}
        <g>
          <circle cx={CX} cy={CY} r={15} fill="var(--slate-900)" />
          <text x={CX} y={CY + 4} textAnchor="middle" className="ego-me">{me.name.split(' ').map(x => x[0]).join('')}</text>
        </g>
        {h && (
          <g pointerEvents="none">
            <rect x={Math.min(W - 150, Math.max(4, h.x - 70))} y={h.y > CY ? h.y - h.size - 38 : h.y + h.size + 6} width={146} height={32} rx={6} className="ego-tip" />
            <text x={Math.min(W - 150, Math.max(4, h.x - 70)) + 8} y={(h.y > CY ? h.y - h.size - 38 : h.y + h.size + 6) + 13} className="ego-tip-name">{h.p.name}</text>
            <text x={Math.min(W - 150, Math.max(4, h.x - 70)) + 8} y={(h.y > CY ? h.y - h.size - 38 : h.y + h.size + 6) + 26} className="ego-tip-sub">{label(h.r)}{h.r.status === 'inferred' ? ' · inferred' : ''}</text>
          </g>
        )}
      </svg>
      <div className="ego-foot">
        <span className="ego-key"><i className="k-solid" />formal</span>
        <span className="ego-key"><i className="k-dash" />influence</span>
        <span className="ego-key"><i className="k-opp" />opposes</span>
        <span className="grow" />
        <Button size="sm" variant="ghost" icon={<Network size={13} />} onClick={() => nav(`/stakeholders?view=map&focus=${pid}`)}>Open in map</Button>
      </div>
    </div>
  )
}
