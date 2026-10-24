// First-run journey: create a workspace from an industry template (/onboarding), then a short, skippable,
// resumable setup (/welcome) that ends in the command center. Progress is derived from real data on the server.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, ArrowRight, Check, Mail, Plus, X } from 'lucide-react'
import { z } from 'zod'
import { useSession } from '../../session/session'
import { ApiError, errorMessage, newIdempotencyKey, request, ws } from '../../api/http'
import { useInvalidate, useLookups, useWorkspace, wk } from '../../api/hooks'
import { useBilling, useOnboarding, useOnboardingUpdate } from '../../api/commercial'
import type { WorkspaceInfo } from '../../api/types'
import { useVocabulary } from '../../lib/vocabulary'
import { ENGAGEMENT_KIND_LABEL, ORG_TYPE_LABEL } from '../../lib/format'
import { t } from '../../lib/motion'
import { useForm, TextField, FormError, Field } from '../../components/form'
import { Button, Kbd, Skeleton } from '../../components/ui'
import { TEMPLATES, templateById, type IndustryTemplate } from '../../../shared/templates'
import { POLICY } from '../../../shared/plans'
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from '../../../shared/permissions'
import './onboarding.css'

const FIELDS_NEED_ATTENTION = 'Some fields need attention'
/** After a failed submit, put the cursor in the first field that needs attention. */
const focusInvalid = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('.ob [aria-invalid="true"]')?.focus())
const plural = (w: string) => (/(s|x|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`)

function Mark() {
  return (
    <span className="ob-mark">
      <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7 1.4v11.2" stroke="currentColor" strokeWidth="1.3" /></svg>
      Meridian
    </span>
  )
}

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="ob-top">
      <Mark />
      <div className="ob-top-end">{children}</div>
    </header>
  )
}

// ── /onboarding: create a workspace ─────────────────────────────────────────────────────────────

const createSchema = z.object({ name: z.string().trim().min(1, 'Give your workspace a name').max(80, 'Keep it under 80 characters') })

export function CreateWorkspace() {
  const { me, workspace, refresh, switchWorkspace, signOut } = useSession()
  const nav = useNavigate()
  const form = useForm(createSchema, { name: '' })
  const [template, setTemplate] = useState<string | null>(null)
  const [noTrial, setNoTrial] = useState<{ id: string; name: string } | null>(null)
  const chosen = templateById(template)
  const groupId = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await form.submit(async v => {
      const w = await request<{ id: string; name: string; trial: boolean }>('/api/workspaces', { method: 'POST', body: { name: v.name, template: template ?? 'other' } })
      await refresh()
      if (!w.trial) { setNoTrial({ id: w.id, name: w.name }); return }
      switchWorkspace(w.id)
      nav('/welcome', { replace: true })
    })
    if (!ok) focusInvalid()
  }

  const open = (id: string, to: string) => { switchWorkspace(id); nav(to, { replace: true }) }

  if (noTrial) {
    return (
      <div className="ob">
        <TopBar />
        <main className="ob-main ob-narrow">
          <motion.section className="ob-notrial" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.slow }}>
            <span className="ob-done-dot"><Check size={16} /></span>
            <h1 className="t-display" tabIndex={-1} ref={el => el?.focus()}>{noTrial.name} is ready</h1>
            <p className="ob-lede">
              Each person can start {POLICY.trialsPerUser} free trials and you’ve used yours, so this workspace needs a plan before your team can work in it.
              Your other workspaces aren’t affected.
            </p>
            <div className="row gap-2 ob-wrap">
              <Button variant="primary" icon={<ArrowRight size={14} />} onClick={() => open(noTrial.id, '/settings/billing')}>Choose a plan</Button>
              <Button variant="ghost" onClick={() => open(noTrial.id, '/')}>Not now</Button>
            </div>
          </motion.section>
        </main>
      </div>
    )
  }

  return (
    <div className="ob">
      <TopBar>
        {workspace && <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={14} />Back to {workspace.name}</Link>}
        <span className="ob-top-user c3 t-small">{me?.user.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>Sign out</button>
      </TopBar>
      <main className="ob-main">
        <motion.div className="ob-head" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.slow }}>
          <p className="ob-eyebrow">{workspace ? 'New workspace' : `Welcome${me?.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}`}</p>
          <h1 className="t-display">Set up your workspace</h1>
          <p className="ob-lede">A workspace holds your team’s stakeholders, relationships and decisions. Pick the closest starting point — it only sets labels and defaults, which you can change any time.</p>
        </motion.div>

        {!!me?.invitations.length && (
          <section className="ob-invites" aria-label="Pending invitations">
            <Mail size={15} className="ob-invites-icon" />
            <div>
              <p className="t-strong">{me.invitations.length === 1 ? 'You’ve been invited to a workspace' : `You’ve been invited to ${me.invitations.length} workspaces`}</p>
              <ul>
                {me.invitations.map(i => <li key={i.id}><span className="t-strong">{i.workspaceName}</span> <span className="c3">as {ROLE_LABEL[i.role]}</span></li>)}
              </ul>
              <p className="c3 t-small">To join instead of starting your own, open the link in your invitation email.</p>
            </div>
          </section>
        )}

        <form className="ob-create" onSubmit={e => void submit(e)} noValidate>
          <div className="ob-create-form">
            <div className="ob-name">
              <TextField form={form} name="name" label="Workspace name" placeholder="e.g. Westshire Infrastructure" autoFocus autoComplete="organization" hint="Usually your organization or team." />
            </div>

            <fieldset className="ob-templates">
              <legend className="field-label" id={groupId}>What kind of work is it for?</legend>
              <div className="ob-template-grid" role="radiogroup" aria-labelledby={groupId}>
                {TEMPLATES.map(tp => (
                  <label key={tp.id} className="ob-template" data-selected={template === tp.id || undefined}>
                    <input type="radio" name="template" value={tp.id} checked={template === tp.id} onChange={() => setTemplate(tp.id)} className="sr-only" />
                    <span className="ob-template-top">
                      <span className="t-strong">{tp.label}</span>
                      <span className="ob-radio" aria-hidden>{template === tp.id && <Check size={11} strokeWidth={3} />}</span>
                    </span>
                    <span className="ob-template-desc">{tp.description}</span>
                    <span className="ob-template-vocab">{plural(tp.vocabulary.initiative)} · {plural(tp.vocabulary.organization)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <aside className="ob-preview" aria-live="polite">
            <p className="ob-preview-label">Preview</p>
            <p className="ob-preview-name t-heading truncate">{(form.values.name as string)?.trim() || 'Your workspace'}</p>
            <TemplatePreview template={chosen} />
            <div className="ob-trial">
              <p className="t-strong">{POLICY.trialDays}-day Professional trial</p>
              <ul>
                <li><Check size={13} />Up to {POLICY.trialSeats} people</li>
                <li><Check size={13} />Every Professional feature</li>
                <li><Check size={13} />No card needed</li>
              </ul>
            </div>
            {form.formError && form.formError !== FIELDS_NEED_ATTENTION && <FormError form={form} />}
            <Button variant="primary" type="submit" loading={form.submitting} className="ob-create-submit" icon={!form.submitting && <ArrowRight size={14} />}>Create workspace</Button>
          </aside>
        </form>
      </main>
    </div>
  )
}

function TemplatePreview({ template }: { template: IndustryTemplate | null }) {
  const tp = template ?? templateById('other')!
  const v = tp.vocabulary
  return (
    <motion.div key={tp.id} className="ob-preview-body" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }}>
      <dl className="ob-vocab">
        <div><dt>You’ll track</dt><dd>{plural(v.initiative)}, {plural(v.stakeholder)} and {plural(v.organization)}</dd></div>
        <div><dt>Engagement types</dt><dd className="ob-chips">{tp.engagementKinds.filter(k => k !== 'other').map(k => <span key={k} className="ob-chip">{ENGAGEMENT_KIND_LABEL[k] ?? k}</span>)}</dd></div>
        <div className="ob-vocab-orgs"><dt>{v.organization} types</dt><dd className="c2">{tp.organizationTypes.filter(k => k !== 'other').slice(0, 5).map(k => ORG_TYPE_LABEL[k] ?? k).join(', ')}</dd></div>
      </dl>
      {!template && <p className="t-small c3">Choose a starting point to see its defaults.</p>}
    </motion.div>
  )
}

// ── /welcome: four short, skippable steps ──────────────────────────────────────────────────────

type StepId = 'workspace' | 'initiative' | 'stakeholders' | 'team'
const STEPS: StepId[] = ['workspace', 'initiative', 'stakeholders', 'team']

interface Created { initiative: { id: string; name: string; code: string } | null; stakeholders: string[]; invites: { email: string; role: Role }[]; configured: boolean }

const stepVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 16 }),
  center: { opacity: 1, x: 0, transition: t.base },
  exit: (d: number) => ({ opacity: 0, x: d * -12, transition: t.exit }),
}

export function Welcome() {
  const { can, workspace } = useSession()
  const nav = useNavigate()
  const ob = useOnboarding()
  const wsq = useWorkspace()
  const vocab = useVocabulary()
  const update = useOnboardingUpdate()
  const [step, setStep] = useState<StepId | 'ready' | null>(null)
  const [dir, setDir] = useState(1)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [created, setCreated] = useState<Created>({ initiative: null, stakeholders: [], invites: [], configured: false })
  const [moved, setMoved] = useState(false)
  const allowed = can('workspace.update')

  // Open at the first incomplete step, once, when progress first arrives.
  useEffect(() => {
    if (!ob.data || step) return
    const server = new Set(ob.data.completed)
    setDone(server)
    setStep(STEPS.find(s => !server.has(s)) ?? 'ready')
  }, [ob.data, step])

  if (!allowed) return <Navigate to="/" replace />

  const template = templateById(ob.data?.template)
  const go = (to: StepId | 'ready') => {
    const from = step === 'ready' || !step ? STEPS.length : STEPS.indexOf(step)
    const target = to === 'ready' ? STEPS.length : STEPS.indexOf(to)
    setDir(target >= from ? 1 : -1)
    setMoved(true)
    setStep(to)
    if (to === 'ready') update.mutate({ dismissed: true })
  }
  const next = () => { const i = STEPS.indexOf(step as StepId); go(STEPS[i + 1] ?? 'ready') }
  const back = () => { const i = STEPS.indexOf(step as StepId); if (i > 0) go(STEPS[i - 1]) }
  const complete = (s: StepId) => {
    setDone(d => new Set(d).add(s)) // optimistic
    update.mutate({ complete: s })
    next()
  }
  const skipAll = () => { update.mutate({ dismissed: true }); nav('/', { replace: true }) }

  const labels: Record<StepId, string> = {
    workspace: 'Your workspace',
    initiative: `First ${vocab.lower('initiative')}`,
    stakeholders: `Add ${vocab.lower('stakeholder', true)}`,
    team: 'Invite your team',
  }
  const index = step && step !== 'ready' ? STEPS.indexOf(step) : STEPS.length
  const name = wsq.data?.name ?? workspace?.name ?? 'Your workspace'

  return (
    <div className="ob ob-welcome">
      <TopBar>
        <span className="ob-top-ws t-small c2 truncate">{name}</span>
        {step !== 'ready' && <Button variant="ghost" size="sm" onClick={skipAll}>Skip setup</Button>}
      </TopBar>

      {!step || !wsq.data ? (
        <main className="ob-main ob-steps" aria-busy>
          <div className="ob-rail"><Skeleton h={14} w={120} /><Skeleton h={14} w={140} /><Skeleton h={14} w={110} /><Skeleton h={14} w={130} /></div>
          <div className="ob-card"><Skeleton h={24} w="50%" /><Skeleton h={14} w="80%" /><Skeleton h={34} /><Skeleton h={34} /></div>
        </main>
      ) : step === 'ready' ? (
        <Ready name={name} created={created} done={done} vocab={vocab} onOpen={() => { update.mutate({ dismissed: true }); nav('/', { replace: true }) }} />
      ) : (
        <main className="ob-main ob-steps">
          <nav className="ob-rail" aria-label="Setup progress">
            <p className="ob-rail-title t-caption c3">Set up in about 2 minutes</p>
            <ol>
              {STEPS.map((s, i) => {
                const isDone = done.has(s)
                const current = s === step
                return (
                  <li key={s}>
                    <button type="button" className="ob-rail-step" data-state={current ? 'current' : isDone ? 'done' : 'todo'} aria-current={current ? 'step' : undefined} onClick={() => go(s)}>
                      <span className="ob-rail-dot" aria-hidden>{isDone ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                      <span className="ob-rail-label">{labels[s]}</span>
                      {isDone && <span className="sr-only">(done)</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>

          <div className="ob-progress" aria-hidden>
            <div className="ob-progress-bar">{STEPS.map(s => <i key={s} data-on={done.has(s) || s === step || undefined} data-current={s === step || undefined} />)}</div>
            <span className="t-caption c3">Step {index + 1} of {STEPS.length} · {labels[step]}</span>
          </div>

          <div className="ob-stage">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.section key={step} className="ob-card" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit" aria-labelledby="ob-step-title">
                {step === 'workspace' && <ConfigureStep focus={moved} workspace={wsq.data} template={template} onDone={() => { setCreated(c => ({ ...c, configured: true })); complete('workspace') }} onSkip={next} />}
                {step === 'initiative' && <InitiativeStep focus={moved} template={template} created={created.initiative} existing={ob.data?.counts.initiatives ?? 0}
                  onCreated={i => { setCreated(c => ({ ...c, initiative: i })); complete('initiative') }} onBack={back} onSkip={next} />}
                {step === 'stakeholders' && <StakeholdersStep focus={moved} template={template} initiative={created.initiative} added={created.stakeholders}
                  onAdded={names => setCreated(c => ({ ...c, stakeholders: [...c.stakeholders, ...names] }))} onDone={() => complete('stakeholders')} onBack={back} onSkip={next} />}
                {step === 'team' && <TeamStep focus={moved} sent={created.invites}
                  onSent={inv => setCreated(c => ({ ...c, invites: [...c.invites, ...inv] }))} onDone={() => complete('team')} onBack={back} onSkip={next} />}
              </motion.section>
            </AnimatePresence>
          </div>
        </main>
      )}
    </div>
  )
}

type Vocab = ReturnType<typeof useVocabulary>

function StepHead({ focus, title, children, eyebrow }: { focus: boolean; title: string; children?: ReactNode; eyebrow?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  // After a step change (not on first load) focus lands on the heading, so keyboard and screen-reader users start at the top.
  useEffect(() => { if (focus) ref.current?.focus({ preventScroll: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <header className="ob-step-head">
      {eyebrow && <p className="ob-eyebrow">{eyebrow}</p>}
      <h1 id="ob-step-title" className="t-title" tabIndex={-1} ref={ref}>{title}</h1>
      {children && <p className="ob-step-lede">{children}</p>}
    </header>
  )
}

function StepFooter({ onBack, onSkip, submitting, label = 'Continue', skipLabel = 'Skip for now' }: { onBack?: () => void; onSkip?: () => void; submitting?: boolean; label?: string; skipLabel?: string }) {
  return (
    <footer className="ob-step-foot">
      {onBack ? <Button type="button" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack} className="ob-back" aria-label="Back">Back</Button> : <span />}
      <div className="row gap-2">
        {onSkip && <Button type="button" variant="ghost" onClick={onSkip}>{skipLabel}</Button>}
        <Button type="submit" variant="primary" loading={submitting} icon={!submitting && <ArrowRight size={14} />} className="ob-continue">{label}</Button>
      </div>
    </footer>
  )
}

// Step 1 — rename and adjust vocabulary.
const word = (label: string) => z.string().trim().min(1, `Enter a word for ${label}`).max(30, 'Keep it under 30 characters')
const configSchema = z.object({ name: z.string().trim().min(1, 'Give your workspace a name').max(80, 'Keep it under 80 characters'), initiative: word('initiatives'), stakeholder: word('stakeholders'), organization: word('organizations') })

function ConfigureStep({ focus, workspace, template, onDone, onSkip }: { focus: boolean; workspace: WorkspaceInfo | undefined; template: IndustryTemplate | null; onDone: () => void; onSkip: () => void }) {
  const { refresh } = useSession()
  const qc = useQueryClient()
  const v = { initiative: 'Initiative', stakeholder: 'Stakeholder', organization: 'Organization', ...(workspace?.settings.vocabulary ?? {}) }
  const form = useForm(configSchema, { name: workspace?.name ?? '', initiative: v.initiative, stakeholder: v.stakeholder, organization: v.organization })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    form.submit(async val => {
      const body: { name?: string; vocabulary?: Record<string, string> } = {}
      if (val.name !== workspace?.name) body.name = val.name
      const vocabulary = { initiative: val.initiative, stakeholder: val.stakeholder, organization: val.organization }
      if (Object.entries(vocabulary).some(([k, w]) => v[k as keyof typeof v] !== w)) body.vocabulary = vocabulary
      if (Object.keys(body).length) {
        const w = await request<WorkspaceInfo>(ws('/settings'), { method: 'PATCH', body })
        qc.setQueryData(wk('workspace'), w)
        if (body.name) void refresh()
      }
      onDone()
    }).then(ok => { if (!ok) focusInvalid() })
  }
  const vals = form.values as Record<string, string>
  const preview = [vals.initiative, vals.stakeholder, vals.organization].map(w => (w?.trim() ? plural(w.trim()) : '…'))
  return (
    <form onSubmit={submit} noValidate className="ob-step">
      <StepHead focus={focus} title="Make it yours" eyebrow={template ? `${template.label} template` : undefined}>
        Check the name and the words your team uses. Meridian uses them in menus, forms and briefings.
      </StepHead>
      <TextField form={form} name="name" label="Workspace name" autoFocus={!focus} />
      <div className="ob-words">
        <p className="field-label">What do you call…</p>
        <div className="ob-words-grid">
          <TextField form={form} name="initiative" label="A piece of work" hint="e.g. Project, Programme" />
          <TextField form={form} name="stakeholder" label="A person you engage" hint="e.g. Stakeholder, Contact" />
          <TextField form={form} name="organization" label="An organization" hint="e.g. Client, Account" />
        </div>
        <p className="ob-words-preview t-small c2" aria-live="polite">Your sidebar will show <strong>{preview.join(' · ')}</strong></p>
      </div>
      <FormError form={form} />
      <StepFooter onSkip={onSkip} submitting={form.submitting} />
    </form>
  )
}

// Step 2 — first initiative.
const suggestCode = (name: string) => {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const c = words.length === 1 ? words[0].slice(0, 3) : words.map(w => w[0]).join('').slice(0, 4)
  return c.length < 2 ? (words[0] + 'X').slice(0, 2) : c
}
const initiativeSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(200),
  code: z.string().trim().min(2, '2–8 characters').max(8, '2–8 characters').regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
})

function InitiativeStep({ focus, template, created, existing, onCreated, onBack, onSkip }: { focus: boolean; template: IndustryTemplate | null; created: Created['initiative']; existing: number; onCreated: (i: NonNullable<Created['initiative']>) => void; onBack: () => void; onSkip: () => void }) {
  const vocab = useVocabulary()
  const invalidate = useInvalidate()
  const form = useForm(initiativeSchema, { name: '', code: '' })
  const [codeTouched, setCodeTouched] = useState(false)
  const ex = template?.examples
  const one = vocab.lower('initiative')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (created) { onCreated(created); return }
    form.submit(async v => {
      try {
        const r = await request<{ id: string; name: string; code: string }>(ws('/initiatives'), { method: 'POST', body: { name: v.name, code: v.code.toUpperCase(), status: 'active' }, idempotencyKey: newIdempotencyKey() })
        invalidate()
        onCreated({ id: r.id, name: r.name ?? v.name, code: r.code ?? v.code.toUpperCase() })
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) throw new ApiError(409, 'duplicate', `That code is already used by another ${one}. Try a different one.`, { code: 'Already in use' })
        throw err
      }
    }).then(ok => { if (!ok) focusInvalid() })
  }

  return (
    <form onSubmit={submit} noValidate className="ob-step">
      <StepHead focus={focus} title={`Add your first ${one}`}>
        {/^[aeiou]/i.test(one) ? 'An' : 'A'} {one} is the piece of work your stakeholders care about. Everything you record can be linked to it.
      </StepHead>
      {created ? (
        <div className="ob-created"><span className="ob-done-dot sm"><Check size={12} /></span><span><span className="ob-code">{created.code}</span> <span className="t-strong">{created.name}</span> is set up.</span></div>
      ) : (
        <>
          {existing > 0 && <p className="ob-note t-small">This workspace already has {existing} {existing === 1 ? one : vocab.lower('initiative', true)}. You can add another or skip.</p>}
          <div className="ob-initiative">
            <Field label="Name" error={form.error('name')}>
              {p => <input {...p} className="input" placeholder={ex?.initiative ?? 'e.g. Northern Rail Link'} autoFocus value={String(form.values.name ?? '')}
                onChange={e => { form.set('name', e.target.value); if (!codeTouched) form.set('code', suggestCode(e.target.value)) }} onBlur={() => form.blur('name')} />}
            </Field>
            <Field label="Short code" error={form.error('code')} hint="Used in references">
              {p => <input {...p} className="input ob-code-input" placeholder={ex?.initiativeCode ?? 'NRL'} maxLength={8} value={String(form.values.code ?? '')}
                onChange={e => { setCodeTouched(true); form.set('code', e.target.value.toUpperCase()) }} onBlur={() => form.blur('code')} />}
            </Field>
          </div>
        </>
      )}
      <FormError form={form} />
      <StepFooter onBack={onBack} onSkip={created ? undefined : onSkip} submitting={form.submitting} label={created ? 'Continue' : `Create ${one}`} />
    </form>
  )
}

// Step 3 — quick multi-add of stakeholders.
interface PersonRow { key: number; name: string; title: string; error?: string }
const MAX_ROWS = 8
let rowKey = 0
const blankPerson = (): PersonRow => ({ key: ++rowKey, name: '', title: '' })

function StakeholdersStep({ focus, template, initiative, added, onAdded, onDone, onBack, onSkip }: { focus: boolean; template: IndustryTemplate | null; initiative: Created['initiative']; added: string[]; onAdded: (names: string[]) => void; onDone: () => void; onBack: () => void; onSkip: () => void }) {
  const vocab = useVocabulary()
  const invalidate = useInvalidate()
  const lookups = useLookups()
  const [rows, setRows] = useState<PersonRow[]>(() => [blankPerson(), blankPerson(), blankPerson()])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const titles = template?.examples.stakeholderTitles ?? ['Sponsor', 'Decision maker', 'Advisor']
  const link = initiative ?? (lookups.data?.initiatives.length === 1 ? lookups.data.initiatives[0] : null)
  const many = vocab.lower('stakeholder', true)

  const rowsRef = useRef<HTMLDivElement>(null)
  const focusRow = (key: number) => requestAnimationFrame(() => rowsRef.current?.querySelector<HTMLInputElement>(`[data-row="${key}"] input`)?.focus())
  const setRow = (key: number, patch: Partial<PersonRow>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch, error: patch.name !== undefined || patch.title !== undefined ? undefined : r.error } : r)))
  const addRow = () => setRows(rs => (rs.length >= MAX_ROWS ? rs : [...rs, blankPerson()]))
  const removeRow = (key: number) => setRows(rs => (rs.length === 1 ? [blankPerson()] : rs.filter(r => r.key !== key)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFormError(null)
    const filled = rows.filter(r => r.name.trim() || r.title.trim())
    const invalid = filled.filter(r => !r.name.trim())
    if (invalid.length) { setRows(rs => rs.map(r => (invalid.includes(r) ? { ...r, error: 'Add a name, or clear the title' } : r))); focusRow(invalid[0].key); return }
    if (!filled.length) {
      if (added.length) { onDone(); return }
      setFormError(`Add at least one name, or skip for now.`)
      return
    }
    setBusy(true)
    const results = await Promise.allSettled(filled.map(r => request(ws('/stakeholders'), {
      method: 'POST', idempotencyKey: newIdempotencyKey(),
      body: { name: r.name.trim(), ...(r.title.trim() ? { title: r.title.trim() } : {}), ...(link ? { initiativeIds: [link.id] } : {}) },
    })))
    const ok = filled.filter((_, i) => results[i].status === 'fulfilled')
    const failed = new Map<number, unknown>()
    filled.forEach((r, i) => { const res = results[i]; if (res.status === 'rejected') failed.set(r.key, res.reason) })
    if (ok.length) { onAdded(ok.map(r => r.name.trim())); invalidate() }
    setBusy(false)
    if (!failed.size) { onDone(); return }
    setRows(rs => {
      const left = rs.filter(r => failed.has(r.key)).map(r => ({ ...r, error: errorMessage(failed.get(r.key)) }))
      return left.length ? left : [blankPerson()]
    })
    setFormError(ok.length ? `Added ${ok.length}. ${failed.size} couldn’t be saved — check the rows below.` : 'Nothing was saved. Check the rows below and try again.')
  }

  return (
    <form onSubmit={e => void submit(e)} noValidate className="ob-step">
      <StepHead focus={focus} title={`Add a few ${many}`}>
        Start with the people who matter most{link ? <> to <span className="t-strong">{link.name}</span></> : ''}. Names are enough — add stance, influence and organizations later.
      </StepHead>

      {added.length > 0 && (
        <ul className="ob-added" aria-label={`Added ${many}`}>
          {added.map((n, i) => <motion.li key={n + i} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, transition: t.fast }}><Check size={12} />{n}</motion.li>)}
        </ul>
      )}

      <div className="ob-rows" role="group" aria-label={`New ${many}`} ref={rowsRef}>
        <div className="ob-rows-head t-caption c3" aria-hidden><span>Name</span><span>Title or role <span className="c3">(optional)</span></span><span /></div>
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div key={r.key} data-row={r.key} className="ob-row" data-invalid={r.error ? true : undefined} layout="position"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
              <input className="input" aria-label={`Name ${i + 1}`} placeholder={i === 0 ? 'Full name' : ''} value={r.name} autoFocus={i === 0 && !added.length}
                aria-invalid={r.error ? true : undefined} onChange={e => setRow(r.key, { name: e.target.value })} />
              <input className="input" aria-label={`Title ${i + 1}`} placeholder={titles[i % titles.length]} value={r.title} onChange={e => setRow(r.key, { title: e.target.value })} />
              <Button type="button" variant="ghost" size="sm" icon={<X size={13} />} aria-label={`Remove row ${i + 1}`} onClick={() => removeRow(r.key)} />
              {r.error && <p className="field-error ob-row-error" role="alert"><AlertCircle size={12} />{r.error}</p>}
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length < MAX_ROWS && <Button type="button" variant="ghost" size="sm" icon={<Plus size={13} />} onClick={addRow} className="ob-add-row">Add another</Button>}
      </div>
      {formError && <div className="form-error" role="alert"><AlertCircle size={14} /><span>{formError}</span></div>}
      <StepFooter onBack={onBack} onSkip={onSkip} submitting={busy} label={rows.some(r => r.name.trim()) ? `Add ${many}` : added.length ? 'Continue' : `Add ${many}`} />
    </form>
  )
}

// Step 4 — invite teammates.
type InviteRole = Exclude<Role, 'owner'>
const INVITE_ROLES: InviteRole[] = ['admin', 'manager', 'contributor', 'viewer']
interface InviteRow { key: number; email: string; role: InviteRole; error?: string }
const blankInvite = (role: InviteRole = 'contributor'): InviteRow => ({ key: ++rowKey, email: '', role })
const emailOk = (s: string) => z.email().safeParse(s.trim()).success

function TeamStep({ focus, sent, onSent, onDone, onBack, onSkip }: { focus: boolean; sent: { email: string; role: Role }[]; onSent: (i: { email: string; role: Role }[]) => void; onDone: () => void; onBack: () => void; onSkip: () => void }) {
  const billing = useBilling()
  const qc = useQueryClient()
  const { role } = useSession()
  const [rows, setRows] = useState<InviteRow[]>(() => [blankInvite(), blankInvite()])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<ReactNode>(null)
  const used = billing.data?.seats.used
  const limit = billing.data?.entitlements.seatLimit ?? null
  const left = used != null && limit != null ? Math.max(0, limit - used) : null

  const rowsRef = useRef<HTMLDivElement>(null)
  const focusRow = (key: number) => requestAnimationFrame(() => rowsRef.current?.querySelector<HTMLInputElement>(`[data-row="${key}"] input`)?.focus())
  const setRow = (key: number, patch: Partial<InviteRow>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch, error: undefined } : r)))
  const removeRow = (key: number) => setRows(rs => (rs.length === 1 ? [blankInvite()] : rs.filter(r => r.key !== key)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFormError(null)
    const filled = rows.filter(r => r.email.trim())
    const bad = filled.filter(r => !emailOk(r.email))
    const seen = new Set<string>()
    const dupes = filled.filter(r => { const k = r.email.trim().toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false })
    if (bad.length || dupes.length) {
      setRows(rs => rs.map(r => (bad.includes(r) ? { ...r, error: 'Enter a valid email address' } : dupes.includes(r) ? { ...r, error: 'Already in the list' } : r)))
      focusRow((bad[0] ?? dupes[0]).key)
      return
    }
    if (!filled.length) {
      if (sent.length) { onDone(); return }
      setFormError('Add at least one email, or skip for now.')
      return
    }
    setBusy(true)
    const ok: InviteRow[] = []
    const errors = new Map<number, string>()
    let seatLimit = false
    // Sequential, so a seat limit stops the rest cleanly instead of failing them all at once.
    for (const r of filled) {
      if (seatLimit) { errors.set(r.key, 'Not sent — no free seats'); continue }
      try {
        await request(ws('/invitations'), { method: 'POST', idempotencyKey: newIdempotencyKey(), body: { email: r.email.trim().toLowerCase(), role: r.role } })
        ok.push(r)
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) { seatLimit = true; errors.set(r.key, 'Not sent — no free seats') }
        else errors.set(r.key, err instanceof ApiError && err.fields.email ? err.fields.email : errorMessage(err))
      }
    }
    if (ok.length) onSent(ok.map(r => ({ email: r.email.trim().toLowerCase(), role: r.role })))
    void qc.invalidateQueries({ queryKey: wk('billing') })
    setBusy(false)
    if (!errors.size) { onDone(); return }
    setRows(rs => rs.filter(r => errors.has(r.key)).map(r => ({ ...r, error: errors.get(r.key) })))
    if (seatLimit) setFormError(<>This workspace has no free seats. {role === 'owner' ? <Link className="inline-link" to="/settings/billing">Add seats in Billing</Link> : 'Ask the workspace owner to add seats.'}</>)
    else if (ok.length) setFormError(`Sent ${ok.length}. ${errors.size} couldn’t be sent — check below.`)
  }

  return (
    <form onSubmit={e => void submit(e)} noValidate className="ob-step">
      <StepHead focus={focus} title="Invite your team">
        Stakeholder work is a team sport. Invitations are emailed and stay valid for a week.
      </StepHead>

      <div className="ob-seats t-small" aria-live="polite">
        {billing.isPending ? <Skeleton w={160} h={12} /> : used != null && limit != null ? (
          <>
            <span className="ob-seat-meter" aria-hidden><i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>
            <span><span className="t-strong">{used} of {limit}</span> <span className="c2">seats used{left === 0 ? ' — no free seats' : ` · ${left} free`}</span></span>
          </>
        ) : used != null ? <span className="c2">{used} {used === 1 ? 'person' : 'people'} in this workspace</span> : null}
      </div>

      {sent.length > 0 && (
        <ul className="ob-added" aria-label="Invitations sent">
          {sent.map(s => <motion.li key={s.email} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, transition: t.fast }}><Mail size={12} />{s.email} <span className="c3">· {ROLE_LABEL[s.role]}</span></motion.li>)}
        </ul>
      )}

      <div className="ob-rows ob-rows-invite" role="group" aria-label="Invitations" ref={rowsRef}>
        <div className="ob-rows-head t-caption c3" aria-hidden><span>Email</span><span>Role</span><span /></div>
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div key={r.key} data-row={r.key} className="ob-row" data-invalid={r.error ? true : undefined} layout="position"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
              <input className="input" type="email" inputMode="email" autoComplete="off" aria-label={`Email ${i + 1}`} placeholder={i === 0 ? 'name@company.com' : ''} value={r.email}
                autoFocus={i === 0 && !sent.length} aria-invalid={r.error ? true : undefined} onChange={e => setRow(r.key, { email: e.target.value })} />
              <div className="select-wrap">
                <select className="input select" aria-label={`Role ${i + 1}`} value={r.role} onChange={e => setRow(r.key, { role: e.target.value as InviteRole })} title={ROLE_DESCRIPTION[r.role]}>
                  {INVITE_ROLES.map(x => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                </select>
              </div>
              <Button type="button" variant="ghost" size="sm" icon={<X size={13} />} aria-label={`Remove row ${i + 1}`} onClick={() => removeRow(r.key)} />
              {r.error && <p className="field-error ob-row-error" role="alert"><AlertCircle size={12} />{r.error}</p>}
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length < MAX_ROWS && <Button type="button" variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => setRows(rs => [...rs, blankInvite(rs[rs.length - 1]?.role)])} className="ob-add-row">Add another</Button>}
        <p className="t-small c3 ob-role-hint">{ROLE_LABEL.contributor}s can add and update records. {ROLE_LABEL.admin}s also manage members and settings.</p>
      </div>
      {formError && <div className="form-error" role="alert"><AlertCircle size={14} /><span>{formError}</span></div>}
      <StepFooter onBack={onBack} onSkip={onSkip} submitting={busy} label={rows.some(r => r.email.trim()) ? 'Send invitations' : sent.length ? 'Continue' : 'Send invitations'} />
    </form>
  )
}

// The finish line.
function Ready({ name, created, done, vocab, onOpen }: { name: string; created: Created; done: Set<string>; vocab: Vocab; onOpen: () => void }) {
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => { btn.current?.focus({ preventScroll: true }) }, [])
  const items = useMemo(() => {
    const out: { done: boolean; text: ReactNode; hint?: string }[] = []
    out.push({ done: created.configured || done.has('workspace'), text: 'Workspace named and labels set', hint: 'Adjust any time in Settings' })
    out.push(created.initiative
      ? { done: true, text: <><span className="ob-code">{created.initiative.code}</span> {created.initiative.name}</> }
      : { done: done.has('initiative'), text: done.has('initiative') ? `${vocab.initiatives} set up` : `No ${vocab.lower('initiative')} yet`, hint: done.has('initiative') ? undefined : `Add one from ${vocab.initiatives}` })
    out.push(created.stakeholders.length
      ? { done: true, text: `${created.stakeholders.length} ${created.stakeholders.length === 1 ? vocab.lower('stakeholder') : vocab.lower('stakeholder', true)} added` }
      : { done: done.has('stakeholders'), text: done.has('stakeholders') ? `${vocab.stakeholders} added` : `No ${vocab.lower('stakeholder', true)} yet`, hint: done.has('stakeholders') ? undefined : `Add them from ${vocab.stakeholders}` })
    out.push(created.invites.length
      ? { done: true, text: `${created.invites.length} ${created.invites.length === 1 ? 'invitation' : 'invitations'} sent` }
      : { done: done.has('team'), text: done.has('team') ? 'Team invited' : 'Working solo for now', hint: done.has('team') ? undefined : 'Invite people from Settings → Members' })
    return out
  }, [created, done, vocab])

  return (
    <main className="ob-main ob-narrow">
      <motion.section className="ob-ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: t.slow }} aria-labelledby="ob-ready-title">
        <svg className="ob-ready-mark" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
          <motion.circle cx="28" cy="28" r="26" fill="none" stroke="currentColor" strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1, transition: { duration: 0.4, ease: [0.3, 0, 0, 1] } }} />
          <motion.path d="M19 28.5l6 6 12-13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1, transition: { duration: 0.28, delay: 0.3, ease: [0.3, 0, 0, 1] } }} />
        </svg>
        <h1 id="ob-ready-title" className="t-display">{name} is ready</h1>
        <p className="ob-lede">Your command center will fill in as you log engagements, decisions and commitments.</p>
        <ul className="ob-summary">
          {items.map((it, i) => (
            <motion.li key={i} data-done={it.done || undefined} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { ...t.base, delay: 0.35 + i * 0.05 } }}>
              <span className="ob-summary-dot" aria-hidden>{it.done ? <Check size={11} strokeWidth={3} /> : null}</span>
              <span className="ob-summary-text">{it.text}{it.hint && <span className="c3 t-small"> · {it.hint}</span>}</span>
            </motion.li>
          ))}
        </ul>
        <Button ref={btn} variant="primary" className="ob-ready-cta" onClick={onOpen} icon={<ArrowRight size={14} />}>Open command center</Button>
        <p className="t-small c3">Tip: press <Kbd>⌘K</Kbd> anywhere to find or create anything.</p>
      </motion.section>
    </main>
  )
}
