// Stakeholder briefing page (/stakeholders/:id/briefing?mode=brief|detailed|prep).
import { LayoutGroup, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Copy, Download, Printer, RotateCw, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useStakeholderBriefing, type Briefing, type BriefingItem, type BriefingMode, type BriefingSource, sourceHref } from '../../api/ai'
import { useStakeholder, wk } from '../../api/hooks'
import { ApiError, errorMessage, qs, request, ws } from '../../api/http'
import { BriefingHeader, BriefingSkeleton, BriefingView, briefingToMarkdown } from '../../components/BriefingView'
import { Button, Skeleton } from '../../components/ui'
import { NotFound } from '../../components/NotFound'
import { openCopilot } from '../../lib/copilotBus'
import { useHotkeys } from '../../lib/hotkeys'
import { t } from '../../lib/motion'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import './briefing-page.css'

const MODES: { id: BriefingMode; label: string; hint: string }[] = [
  { id: 'brief', label: 'Brief', hint: 'The essentials in a few lines' },
  { id: 'detailed', label: 'Detailed', hint: 'Full context, history and obligations' },
  { id: 'prep', label: 'Prep', hint: 'Talking points for your next meeting' },
]
const isMode = (v: string | null): v is BriefingMode => v === 'brief' || v === 'detailed' || v === 'prep'

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'stakeholder'
const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { return document.execCommand('copy') } catch { return false } finally { ta.remove() }
}

export function StakeholderBriefing() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { toast, announce, openCreate } = useApp()
  const { can } = useSession()
  const qc = useQueryClient()
  const mode: BriefingMode = isMode(params.get('mode')) ? params.get('mode') as BriefingMode : 'detailed'
  const setMode = (m: BriefingMode) => setParams(p => { const n = new URLSearchParams(p); if (m === 'detailed') n.delete('mode'); else n.set('mode', m); return n }, { replace: true })

  const person = useStakeholder(id)
  const q = useStakeholderBriefing(id, mode)
  const b = q.data
  const [regenerating, setRegenerating] = useState(false)
  const name = b?.subject.name ?? person.data?.name

  useHotkeys({
    Escape: () => { nav(`/stakeholders/${id}`) },
    '1': () => setMode('brief'), '2': () => setMode('detailed'), '3': () => setMode('prep'),
  }, [id, params])

  const notFound = (q.error instanceof ApiError && q.error.status === 404) || (person.error instanceof ApiError && person.error.status === 404)
  if (notFound) return <NotFound what="Stakeholder" back="/stakeholders" backLabel="All stakeholders" />

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const fresh = await request<Briefing>(ws(`/ai/briefings/stakeholders/${id}${qs({ mode, fresh: 1 })}`))
      qc.setQueryData(wk('ai', 'briefing', 'stakeholder', id, mode), fresh)
      announce('Briefing regenerated')
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setRegenerating(false) }
  }
  const copy = async () => {
    if (!b) return
    toast(await copyText(briefingToMarkdown(b)) ? 'Briefing copied with sources' : 'Couldn’t copy. Try Export .md instead.', undefined, 'default')
  }
  const exportMd = () => {
    if (!b) return
    const url = URL.createObjectURL(new Blob([briefingToMarkdown(b)], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `briefing-${slug(b.subject.name)}-${b.mode}-${isoDay()}.md`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const onAction = (it: BriefingItem, src: BriefingSource | undefined) => {
    if (it.action === 'log_engagement' && can('engagement.create') && name) {
      openCreate('engagement', { participantIds: [id], participantOptions: [{ id, name }] })
      return
    }
    if (it.action === 'assign_owner') { nav(`/stakeholders/${id}`); return }
    const href = src ? sourceHref(src) : '#'
    if (href !== '#') nav(href)
  }

  return (
    <>
      <header className="page-head bp-chrome">
        <div className="crumbs">
          <Link to={`/stakeholders/${id}`} className="row gap-1 bp-back" aria-label={`Back to ${name ?? 'profile'}`}><ArrowLeft size={14} />{name ?? <Skeleton w={100} h={11} />}</Link>
          <span className="sep">/</span>
          <span className="here">Briefing</span>
        </div>
        <span className="grow" />
        <Button size="sm" variant="ai" icon={<Sparkles size={14} />} onClick={() => openCopilot({ context: { stakeholderId: id, label: name ?? null, route: location.pathname + location.search } })}>Ask AI</Button>
        <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy()} disabled={!b}>Copy</Button>
        <Button size="sm" icon={<Download size={13} />} onClick={exportMd} disabled={!b}>Export .md</Button>
        <Button size="sm" variant="ghost" icon={<Printer size={14} />} aria-label="Print" title="Print" onClick={() => window.print()} disabled={!b} />
      </header>

      <div className="bp-scroll">
        <article className="bp" aria-busy={q.isPending || regenerating || undefined}>
          <div className="bp-top bp-chrome">
            <div className="grow">
              <h1 className="t-display bp-title">{name ?? <Skeleton w={240} h={24} />}</h1>
              <p className="t-small c2 bp-sub">{MODES.find(m => m.id === mode)?.hint}</p>
            </div>
            <ModeSwitch value={mode} onChange={setMode} />
          </div>
          <h1 className="bp-print-title">{mode === 'prep' ? 'Meeting prep' : 'Briefing'}: {name}</h1>

          {q.isError ? <BriefingError error={q.error} onRetry={() => void q.refetch()} />
            : !b ? <><div className="bp-head-skel"><Skeleton w="60%" h={12} /><Skeleton w="35%" h={12} /></div><BriefingSkeleton sections={mode === 'brief' ? 3 : 5} /></>
            : (
              <motion.div key={`${mode}-${b.generatedAt}`} initial={{ opacity: 0 }} animate={{ opacity: regenerating ? 0.55 : 1, transition: t.fast }}>
                <BriefingHeader b={b} extra={
                  <Button size="sm" variant="ghost" className="bp-chrome" icon={<RotateCw size={13} />} loading={regenerating} onClick={() => void regenerate()}
                    title="Rebuild from the latest records, skipping the cache">Regenerate</Button>
                } />
                <div className="bp-body"><BriefingView briefing={b} hideHeader onAction={onAction} /></div>
              </motion.div>
            )}
        </article>
      </div>
    </>
  )
}

function ModeSwitch({ value, onChange }: { value: BriefingMode; onChange: (m: BriefingMode) => void }) {
  const move = (dir: number) => { const i = MODES.findIndex(m => m.id === value); onChange(MODES[(i + dir + MODES.length) % MODES.length].id) }
  return (
    <LayoutGroup id="bp-mode">
      <div className="bp-seg" role="radiogroup" aria-label="Briefing length"
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) } }}>
        {MODES.map((m, i) => (
          <button key={m.id} role="radio" aria-checked={value === m.id} tabIndex={value === m.id ? 0 : -1} className="bp-seg-btn" title={`${m.hint} (${i + 1})`} onClick={() => onChange(m.id)}>
            {value === m.id && <motion.span layoutId="bp-seg-on" className="bp-seg-on" transition={t.indicator} />}
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

function BriefingError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const api = error instanceof ApiError ? error : null
  const disabled = api?.status === 403 && api.code === 'ai_disabled'
  const limited = api?.status === 429
  const title = disabled ? 'AI features are turned off' : limited ? (api?.code === 'quota_exceeded' ? 'Monthly AI budget used' : 'Too many requests') : 'Couldn’t prepare this briefing'
  return (
    <div className="bp-error" role="alert">
      <AlertCircle size={18} />
      <div className="grow">
        <p className="t-strong">{title}</p>
        <p className="t-small c2">{errorMessage(error)}</p>
        {disabled && <p className="t-small c2">An administrator can turn them on in Settings › AI. The profile still shows recorded facts.</p>}
      </div>
      {!disabled && <Button size="sm" icon={<RotateCw size={13} />} onClick={onRetry}>{limited ? 'Try again' : 'Retry'}</Button>}
    </div>
  )
}
