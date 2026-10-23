// Settings, grouped as Account (profile, notifications & privacy, security) and Workspace (general, members, roles,
// subscription, billing history, usage, AI, audit, data). Tabs are routes (/settings/:tab) so they deep-link and survive reloads.
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Bell, Check, ChevronDown, Copy, CreditCard, Database, Gauge, History, KeyRound, Lock, LogOut, Mail, ReceiptText, RotateCw, Settings2, Shield, Sparkle, Trash2, UserPlus, UserRound, Users, X, type LucideIcon } from 'lucide-react'
import { useAIStatus, useAIUsage, useUpdateAISettings, type AISettings, type AIStatus } from '../../api/ai'
import { useInvalidate, useWorkspace, wk } from '../../api/hooks'
import { ApiError, errorMessage, request, ws } from '../../api/http'
import type { WorkspaceInfo } from '../../api/types'
import { Avatar, Button, Pill, Skeleton } from '../../components/ui'
import { Menu, type MenuOption } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Drawer'
import { FormError, SelectField, TextField, useForm } from '../../components/form'
import { useSession } from '../../session/session'
import { useApp } from '../../shell/context'
import { canChangeRole, ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type Action, type Role } from '../../../shared/permissions'
import { inviteSchema, workspaceSettingsSchema } from '../../../shared/schemas'
import { t } from '../../lib/motion'
import { daysFromToday, fmtDate } from '../../lib/format'
import { LoadError } from '../Home'
import { useBilling, useResendInvite } from '../../api/commercial'
import { UpgradePrompt, useHandlesPaymentRequired } from '../../components/UpgradePrompt'
import { absTime, Meter, PageTitle, relTime, SectionHead, useMembers, type Invitation, type Member, type MembersData } from './common'
import { ProfileTab, NotificationsTab, SecurityTab } from './Account'
import { SubscriptionTab, BillingHistoryTab, UsageTab } from './Billing'
import { RolesTab } from './Roles'
import { DataTab } from './DataTab'
import './settings.css'

// ── Tabs ──────────────────────────────────────────────────────────────────────
interface AuditEvent { id: number; action: string; entityType: string | null; entityId: string | null; metadata: Record<string, unknown> | null; createdAt: string; actor: string | null }
interface AuditPage { events: AuditEvent[]; next: number | null }

type TabId = 'profile' | 'notifications' | 'security' | 'general' | 'members' | 'roles' | 'billing' | 'invoices' | 'usage' | 'ai' | 'audit' | 'data'
interface TabDef { id: TabId; label: string; icon: LucideIcon; group: 'Account' | 'Workspace'; visible?: (can: (a: Action) => boolean) => boolean }
const TABS: TabDef[] = [
  { id: 'profile', label: 'My profile', icon: UserRound, group: 'Account' },
  { id: 'notifications', label: 'Notifications & privacy', icon: Bell, group: 'Account' },
  { id: 'security', label: 'Security', icon: Shield, group: 'Account' },
  { id: 'general', label: 'General', icon: Settings2, group: 'Workspace' },
  { id: 'members', label: 'Members', icon: Users, group: 'Workspace' },
  { id: 'roles', label: 'Roles & permissions', icon: KeyRound, group: 'Workspace' },
  { id: 'billing', label: 'Subscription', icon: CreditCard, group: 'Workspace', visible: c => c('billing.read') },
  { id: 'invoices', label: 'Billing history', icon: ReceiptText, group: 'Workspace', visible: c => c('billing.read') },
  { id: 'usage', label: 'Usage', icon: Gauge, group: 'Workspace', visible: c => c('billing.read') },
  { id: 'ai', label: 'AI', icon: Sparkle, group: 'Workspace' },
  { id: 'audit', label: 'Audit log', icon: History, group: 'Workspace' },
  { id: 'data', label: 'Data management', icon: Database, group: 'Workspace' },
]

let focusTabAfterNav = false

// ── Screen ────────────────────────────────────────────────────────────────────
export function Settings() {
  const { tab: raw } = useParams()
  const nav = useNavigate()
  const tab = (raw ?? 'general') as TabId
  const navRef = useRef<HTMLDivElement>(null)
  const { workspace, can } = useSession()
  const visible = TABS.filter(x => x.id === tab || !x.visible || x.visible(can))

  // /settings and /settings/:tab are separate routes, so keyboard tab switches remount this screen;
  // a module flag carries "keep focus on the tab list" across that remount.
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`#set-tab-${tab}`)
    // On narrow screens the tab strip scrolls horizontally: keep the active tab in view.
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if (!focusTabAfterNav) return
    focusTabAfterNav = false
    el?.focus()
  }, [tab])

  if (!TABS.some(x => x.id === tab)) return <Navigate to="/settings" replace />
  const current = TABS.find(x => x.id === tab)!
  const go = (id: TabId) => nav(id === 'general' ? '/settings' : `/settings/${id}`)

  // Roving focus across tabs: ↑/↓ (vertical) and ←/→ (horizontal on narrow screens), Home/End.
  const onKey = (e: KeyboardEvent) => {
    const i = visible.findIndex(x => x.id === tab)
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    let n = i
    if (step) n = (i + step + visible.length) % visible.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = visible.length - 1
    else return
    e.preventDefault()
    focusTabAfterNav = true
    go(visible[n].id)
  }

  return (
    <div className="page settings">
      <header className="page-head">
        <div className="crumbs">
          <Link to="/settings">Settings</Link><span className="sep">/</span>
          <span className="here">{current.label}</span>
        </div>
        <span className="grow" />
        {workspace && <span className="t-small c3 truncate set-head-ws">{workspace.name}</span>}
      </header>
      <div className="set-body">
        <LayoutGroup id="set-tabs">
          <div className="set-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical" ref={navRef} onKeyDown={onKey}>
            {visible.map((x, i) => {
              const on = x.id === tab
              return (
                <Fragment key={x.id}>
                  {(i === 0 || visible[i - 1].group !== x.group) && <p className="set-nav-label t-caption c3" role="presentation">{x.group}</p>}
                  <button id={`set-tab-${x.id}`} role="tab" aria-selected={on} aria-controls="set-panel" tabIndex={on ? 0 : -1}
                    className="set-tab" onClick={() => go(x.id)}>
                    {on && <motion.span layoutId="set-tab-ind" className="set-tab-ind" transition={t.indicator} />}
                    <x.icon size={14} strokeWidth={1.9} aria-hidden />
                    <span className="truncate">{x.label}</span>
                  </button>
                </Fragment>
              )
            })}
          </div>
        </LayoutGroup>
        <div className="set-scroll" tabIndex={0} role="region" aria-label="Settings content">
          <div className="set-content" role="tabpanel" id="set-panel" aria-labelledby={`set-tab-${tab}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: { duration: 0.07 } }}>
                {tab === 'profile' && <ProfileTab />}
                {tab === 'notifications' && <NotificationsTab />}
                {tab === 'security' && <SecurityTab />}
                {tab === 'general' && <GeneralTab />}
                {tab === 'members' && <MembersTab />}
                {tab === 'roles' && <RolesTab />}
                {tab === 'billing' && <SubscriptionTab />}
                {tab === 'invoices' && <BillingHistoryTab />}
                {tab === 'usage' && <UsageTab />}
                {tab === 'ai' && <AITab />}
                {tab === 'audit' && <AuditTab />}
                {tab === 'data' && <DataTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── General ───────────────────────────────────────────────────────────────────
const generalSchema = z.object({
  name: workspaceSettingsSchema.shape.name.unwrap(),
  'vocabulary.initiative': z.string().trim().max(30, 'Keep it to 30 characters or fewer'),
  'vocabulary.stakeholder': z.string().trim().max(30, 'Keep it to 30 characters or fewer'),
  'vocabulary.organization': z.string().trim().max(30, 'Keep it to 30 characters or fewer'),
})
type GeneralValues = z.input<typeof generalSchema>
const VOCAB: { key: 'initiative' | 'stakeholder' | 'organization'; label: string; fallback: string }[] = [
  { key: 'initiative', label: 'Initiative', fallback: 'Initiative' },
  { key: 'stakeholder', label: 'Stakeholder', fallback: 'Stakeholder' },
  { key: 'organization', label: 'Organization', fallback: 'Organization' },
]
const toValues = (w: WorkspaceInfo): GeneralValues => ({
  name: w.name,
  'vocabulary.initiative': w.settings.vocabulary?.initiative ?? '',
  'vocabulary.stakeholder': w.settings.vocabulary?.stakeholder ?? '',
  'vocabulary.organization': w.settings.vocabulary?.organization ?? '',
})

function GeneralTab() {
  const q = useWorkspace()
  return (
    <>
      <PageTitle title="General" sub="How this workspace is named and what it calls things." />
      {q.isPending ? <GeneralSkeleton /> : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : (
        <>
          <GeneralForm key={q.data.id} w={q.data} />
          <AccessSection w={q.data} />
          <DangerZone w={q.data} />
        </>
      )}
    </>
  )
}

function GeneralSkeleton() {
  return (
    <div className="set-card set-skel" aria-busy="true" aria-label="Loading settings">
      {[0, 1, 2].map(i => (
        <div key={i} className="set-skel-row"><Skeleton w={110} h={11} /><Skeleton w="100%" h={30} r={6} /></div>
      ))}
    </div>
  )
}

function GeneralForm({ w }: { w: WorkspaceInfo }) {
  const { can, refresh } = useSession()
  const { toast } = useApp()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const editable = can('workspace.update')
  const form = useForm(generalSchema, toValues(w))

  const save = async () => {
    const ok = await form.submit(async v => {
      const vocabulary = Object.fromEntries(VOCAB.map(x => [x.key, v[`vocabulary.${x.key}`] || undefined]).filter(([, val]) => val))
      const before = toValues(w)
      const vocabChanged = VOCAB.some(x => before[`vocabulary.${x.key}`] !== v[`vocabulary.${x.key}`])
      // Send only what changed so the audit trail records the fields that actually moved.
      const body = { ...(v.name !== w.name ? { name: v.name } : {}), ...(vocabChanged ? { vocabulary } : {}) }
      const next = await request<WorkspaceInfo>(ws('/settings'), { method: 'PATCH', body })
      qc.setQueryData(wk('workspace'), next)
      form.reset(toValues(next))
    })
    if (ok) {
      toast('Workspace settings saved')
      invalidate()
      void refresh() // the sidebar's workspace name comes from /me
    }
  }

  return (
    <form className="set-section" onSubmit={e => { e.preventDefault(); if (editable && form.dirty) void save() }} noValidate aria-label="Workspace details">
      <SectionHead title="Workspace" sub={editable ? undefined : (
        <span className="row gap-1"><Lock size={12} aria-hidden />Only administrators can change these settings.</span>
      )} />
      <div className="set-card">
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Name</span><span className="t-small c3">Shown in the sidebar, invitations and exports.</span></div>
          <div className="set-field-ctl">
            <TextField form={form} name="name" label="Workspace name" readOnly={!editable} maxLength={80} autoComplete="off" />
          </div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta">
            <span className="t-strong">Vocabulary</span>
            <span className="t-small c3">Rename core record types to match how your team talks. Leave blank to use the default.</span>
          </div>
          <div className="set-field-ctl set-vocab">
            {VOCAB.map(x => (
              <TextField key={x.key} form={form} name={`vocabulary.${x.key}`} label={x.label} placeholder={x.fallback} readOnly={!editable} maxLength={30} autoComplete="off" />
            ))}
          </div>
        </div>
        {editable && (
          <div className="set-card-foot">
            <div className="grow"><FormError form={form} /></div>
            <AnimatePresence>
              {form.dirty && !form.submitting && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => form.reset(toValues(w))}>Discard</Button>
                </motion.span>
              )}
            </AnimatePresence>
            <Button type="submit" variant="primary" size="sm" disabled={!form.dirty} loading={form.submitting}>{form.submitting ? 'Saving…' : 'Save changes'}</Button>
          </div>
        )}
      </div>
    </form>
  )
}

function AccessSection({ w }: { w: WorkspaceInfo }) {
  const { me } = useSession()
  const { toast } = useApp()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(w.id); setCopied(true); toast('Workspace ID copied'); setTimeout(() => setCopied(false), 1600) }
    catch { toast('Couldn’t copy — select the ID and copy it manually', undefined, 'error') }
  }
  return (
    <section className="set-section" aria-labelledby="set-access">
      <div className="set-sec-head"><h2 className="t-heading" id="set-access">Your access</h2></div>
      <div className="set-card">
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Your role</span><span className="t-small c3">{me?.user.email}</span></div>
          <div className="set-field-ctl">
            <div className="row gap-2"><RoleBadge role={w.role} /></div>
            <p className="t-small c2 set-mt">{ROLE_DESCRIPTION[w.role]}</p>
          </div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Workspace ID</span><span className="t-small c3">For support requests and API access.</span></div>
          <div className="set-field-ctl">
            <div className="set-id">
              <code className="mono truncate" title={w.id}>{w.id}</code>
              <Button type="button" variant="ghost" size="sm" icon={copied ? <Check size={13} /> : <Copy size={13} />} aria-label="Copy workspace ID" title="Copy" onClick={() => void copy()} />
            </div>
            <p className="t-small c3 set-mt">Slug <span className="mono">{w.slug}</span></p>
          </div>
        </div>
      </div>
    </section>
  )
}

function DangerZone({ w }: { w: WorkspaceInfo }) {
  const { me, refresh } = useSession()
  const { toast } = useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const members = useMembers()
  const [open, setOpen] = useState(false)
  const mine = members.data?.members.find(m => m.userId === me?.user.id)
  const soleOwner = w.role === 'owner' && (members.data?.members.filter(m => m.role === 'owner').length ?? 0) <= 1
  const leave = useMutation({
    mutationFn: () => request(ws(`/members/${mine!.id}`), { method: 'DELETE' }),
    onSuccess: async () => {
      setOpen(false)
      qc.removeQueries({ queryKey: ['w'] })
      await refresh()
      toast(`You left ${w.name}`)
      nav('/')
    },
    onError: e => { setOpen(false); toast(errorMessage(e), undefined, 'error') },
  })
  return (
    <section className="set-section" aria-labelledby="set-danger">
      <div className="set-sec-head"><h2 className="t-heading" id="set-danger">Danger zone</h2></div>
      <div className="set-card set-danger">
        <div className="set-danger-row">
          <div className="grow">
            <p className="t-strong">Leave workspace</p>
            <p className="t-small c2">
              {soleOwner && members.data ? 'You’re the only owner. Make someone else an owner before you leave.' : 'You’ll lose access to every record in this workspace until someone invites you again.'}
            </p>
          </div>
          <Button type="button" variant="danger" size="sm" icon={<LogOut size={13} />} disabled={!mine || (soleOwner && !!members.data)} onClick={() => setOpen(true)}>Leave…</Button>
        </div>
      </div>
      <ConfirmDialog open={open} danger busy={leave.isPending} title={`Leave ${w.name}?`} confirmLabel="Leave workspace"
        body={<>You’ll lose access immediately. To come back, an administrator will need to invite you again.</>}
        onCancel={() => !leave.isPending && setOpen(false)} onConfirm={() => leave.mutate()} />
    </section>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return <Pill tone={role === 'owner' || role === 'admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[role]}</Pill>
}

// ── Members ───────────────────────────────────────────────────────────────────
function MembersTab() {
  const { can, role: myRole } = useSession()
  const q = useMembers()
  const n = q.data?.members.length
  return (
    <>
      <PageTitle title="Members" sub="Who has access to this workspace and what they can do." />
      <SeatUsage />
      {can('members.invite') && <InviteForm />}
      <section className="set-section" aria-labelledby="set-members">
        <SectionHead title="People" aside={n != null ? <span className="t-small c3 num" id="set-members-count">{n} member{n === 1 ? '' : 's'}</span> : undefined} />
        <h2 className="sr-only" id="set-members">Members</h2>
        {q.isPending ? <MembersSkeleton /> : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : (
          <MembersTable members={q.data.members} myRole={myRole!} />
        )}
      </section>
      {can('members.invite') && q.data && <Invitations items={q.data.invitations} />}
      <RoleLegend mine={myRole} />
    </>
  )
}

/** Seats in use (members + pending invitations) against the plan's limit. */
function SeatUsage() {
  const b = useBilling()
  if (!b.data) return null
  const { seats, entitlements: e, canManage } = b.data
  const limit = e.seatLimit
  const full = limit != null && seats.used >= limit
  return (
    <section className="set-section" aria-label="Seats">
      <div className="set-card seat-card">
        <div className="grow">
          <p className="row gap-2"><span className="t-strong num">{seats.used} of {limit ?? 'unlimited'} seats used</span>{full && <Pill tone="attention">All in use</Pill>}</p>
          {limit != null && <Meter value={seats.used} max={limit} label="Seats used" />}
          <p className="t-small c2">
            {seats.members} member{seats.members === 1 ? '' : 's'} · {seats.pending} pending invitation{seats.pending === 1 ? '' : 's'}
            {e.status === 'trialing' ? ` · trials include ${limit} seats` : ''}. Pending invitations hold a seat until accepted, revoked or expired.
          </p>
        </div>
        {canManage && limit != null && <Link to="/settings/billing" className="btn btn-secondary btn-sm">{e.status === 'trialing' ? 'See plans' : 'Add seats'}</Link>}
      </div>
    </section>
  )
}

function MembersSkeleton() {
  return (
    <div className="set-card set-table" aria-busy="true" aria-label="Loading members">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="mem-row mem-skel"><Skeleton w={28} h={28} r={14} /><div className="grow col-gap"><Skeleton w={140} h={11} /><Skeleton w={190} h={10} /></div><Skeleton w={80} h={20} r={5} /></div>
      ))}
    </div>
  )
}

function InviteForm() {
  const { role: myRole } = useSession()
  const { toast } = useApp()
  const qc = useQueryClient()
  const form = useForm(inviteSchema, { email: '', role: 'contributor' })
  const conflictRef = useRef(false)
  const [seatMsg, setSeatMsg] = useState<string | null>(null)
  const { can } = useSession()
  useHandlesPaymentRequired('seat_limit')
  const roles = ROLES.filter(r => r !== 'owner' && canChangeRole(myRole!, 'viewer', r))
  const sel = form.values.role as Role

  const send = async () => {
    conflictRef.current = false
    setSeatMsg(null)
    let seatLimited = false
    const ok = await form.submit(async v => {
      try {
        await request(ws('/invitations'), { method: 'POST', body: v })
      } catch (e) {
        // "Already a member" belongs to the email field, not a banner.
        if (e instanceof ApiError && e.status === 409) { conflictRef.current = true; throw new ApiError(409, e.code, e.message, { email: e.message }) }
        if (e instanceof ApiError && e.status === 402 && e.code === 'seat_limit') { seatLimited = true; setSeatMsg(e.message) }
        throw e
      }
      toast(`Invitation sent to ${v.email}`)
    })
    if (!ok && (conflictRef.current || seatLimited)) form.setFormError(null)
    if (seatLimited) void qc.invalidateQueries({ queryKey: wk('billing') })
    if (ok) {
      form.reset({ email: '', role: sel as Exclude<Role, 'owner'> })
      void qc.invalidateQueries({ queryKey: wk('members') })
      void qc.invalidateQueries({ queryKey: wk('audit') })
    }
  }

  return (
    <section className="set-section" aria-labelledby="set-invite">
      <div className="set-sec-head"><h2 className="t-heading" id="set-invite">Invite people</h2></div>
      <form className="set-card set-invite" onSubmit={e => { e.preventDefault(); void send() }} noValidate>
        <div className="set-invite-grid">
          <TextField form={form} name="email" label="Email address" type="email" placeholder="name@company.com" autoComplete="off" spellCheck={false} />
          <SelectField form={form} name="role" label="Role" options={roles.map(r => ({ value: r, label: ROLE_LABEL[r] }))} />
          <div className="set-invite-btn">
            <Button type="submit" variant="primary" icon={<UserPlus size={14} />} loading={form.submitting}>{form.submitting ? 'Sending…' : 'Send invite'}</Button>
          </div>
        </div>
        <p className="t-small c2 set-role-hint"><span className="t-strong">{ROLE_LABEL[sel]}</span> — {ROLE_DESCRIPTION[sel]}</p>
        <FormError form={form} />
        {seatMsg && (
          <div className="set-seat-msg" role="alert">
            <Users size={14} aria-hidden />
            <span className="grow">{seatMsg}{!can('billing.manage') && ' Ask a workspace owner to add seats.'}</span>
            {can('billing.manage') && <Link to="/settings/billing" className="btn btn-secondary btn-sm">Add seats</Link>}
          </div>
        )}
        <p className="t-small c3 set-invite-foot">
          <Mail size={12} aria-hidden /> Invitations expire after 7 days. Re-inviting an address replaces its pending invitation.
          {import.meta.env.DEV && <> <Link to="/dev/mail" className="set-link">Dev mailbox</Link></>}
        </p>
      </form>
    </section>
  )
}

function MembersTable({ members, myRole }: { members: Member[]; myRole: Role }) {
  const { me, can, refresh } = useSession()
  const { toast } = useApp()
  const qc = useQueryClient()
  const [menu, setMenu] = useState<{ m: Member; el: HTMLElement } | null>(null)
  const [demote, setDemote] = useState<{ m: Member; next: Role } | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const settle = () => { void qc.invalidateQueries({ queryKey: wk('members') }); void qc.invalidateQueries({ queryKey: wk('audit') }); void qc.invalidateQueries({ queryKey: wk('lookups') }) }

  const changeRole = useMutation({
    mutationFn: ({ m, next }: { m: Member; next: Role }) => request<{ id: string; role: Role }>(ws(`/members/${m.id}`), { method: 'PATCH', body: { role: next } }),
    onSuccess: async (_r, { m, next }) => {
      setDemote(null)
      const self = m.userId === me?.user.id
      toast(self ? `Your role is now ${ROLE_LABEL[next]}` : `${m.name} is now ${ROLE_LABEL[next]}`)
      qc.setQueryData<MembersData>(wk('members'), d => d && ({ ...d, members: d.members.map(x => (x.id === m.id ? { ...x, role: next } : x)) }))
      if (self) { await refresh(); void qc.invalidateQueries({ queryKey: wk('workspace') }) }
    },
    onError: e => { setDemote(null); toast(errorMessage(e), undefined, 'error') },
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: (m: Member) => request(ws(`/members/${m.id}`), { method: 'DELETE' }),
    onSuccess: (_r, m) => { setRemoving(null); toast(`${m.name} was removed from the workspace`) },
    onError: e => { setRemoving(null); toast(errorMessage(e), undefined, 'error') },
    onSettled: settle,
  })

  const pick = (m: Member, next: Role) => {
    if (next === m.role) return
    if (m.role === 'owner' || (m.userId === me?.user.id)) setDemote({ m, next })
    else changeRole.mutate({ m, next })
  }
  const ownerCount = members.filter(m => m.role === 'owner').length
  const optionsFor = (m: Member): MenuOption<Role>[] =>
    ROLES.filter(r => r === m.role || canChangeRole(myRole, m.role, r)).map(r => ({ value: r, label: ROLE_LABEL[r] }))

  return (
    <div className="set-card set-table" role="table" aria-label="Members" aria-describedby="set-members-count">
      <div className="mem-row mem-headrow" role="row">
        <span role="columnheader" className="mem-who">Name</span>
        <span role="columnheader" className="mem-role-col">Role</span>
        <span role="columnheader" className="mem-joined">Joined</span>
        <span role="columnheader" className="mem-act"><span className="sr-only">Actions</span></span>
      </div>
      {members.map(m => {
        const self = m.userId === me?.user.id
        const opts = optionsFor(m)
        const lastOwner = m.role === 'owner' && ownerCount <= 1
        const editable = opts.length > 1 && !lastOwner
        const busy = (changeRole.isPending && changeRole.variables?.m.id === m.id) || (remove.isPending && remove.variables?.id === m.id)
        const removable = !self && can('members.remove') && (m.role !== 'owner' || myRole === 'owner')
        return (
          <div key={m.id} className="mem-row" role="row" data-busy={busy || undefined}>
            <div role="cell" className="mem-who row gap-3">
              <Avatar name={m.name} size={28} seed={m.userId} />
              <div className="grow">
                <p className="row gap-2"><span className="t-strong truncate">{m.name}</span>{self && <span className="set-you">You</span>}</p>
                <p className="t-small c2 truncate">{m.email}</p>
              </div>
            </div>
            <div role="cell" className="mem-role-col">
              {editable ? (
                <button type="button" className="role-btn" aria-haspopup="listbox" aria-expanded={menu?.m.id === m.id}
                  aria-label={`Role for ${m.name}: ${ROLE_LABEL[m.role]}. Change role`} disabled={busy}
                  onClick={e => setMenu({ m, el: e.currentTarget })}>
                  {ROLE_LABEL[m.role]}<ChevronDown size={12} aria-hidden />
                </button>
              ) : <span className="role-static" title={lastOwner && can('members.updateRole') ? 'The only owner can’t be demoted. Make someone else an owner first.' : undefined}>{ROLE_LABEL[m.role]}</span>}
            </div>
            <div role="cell" className="mem-joined t-small c2 num" title={absTime(m.joinedAt)}>{fmtDate(m.joinedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div role="cell" className="mem-act">
              {removable && <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} aria-label={`Remove ${m.name}`} title="Remove from workspace" disabled={busy} onClick={() => setRemoving(m)} />}
            </div>
          </div>
        )
      })}
      <Menu<Role> anchor={menu?.el ?? null} open={!!menu} onClose={() => setMenu(null)} label={menu ? `Role for ${menu.m.name}` : 'Role'}
        options={menu ? optionsFor(menu.m) : []} selected={menu ? [menu.m.role] : []} align="end"
        onSelect={r => { if (menu) pick(menu.m, r) }} />
      <ConfirmDialog open={!!demote} danger={demote?.m.role === 'owner'} busy={changeRole.isPending}
        title={demote ? (demote.m.userId === me?.user.id ? `Change your role to ${ROLE_LABEL[demote.next]}?` : `Demote ${demote.m.name}?`) : ''}
        confirmLabel={demote ? `Make ${ROLE_LABEL[demote.next]}` : 'Confirm'}
        body={demote && (
          <>
            {demote.m.role === 'owner' && <p>{demote.m.userId === me?.user.id ? 'You' : demote.m.name} will no longer be an owner. A workspace must always keep at least one owner.</p>}
            {demote.m.userId === me?.user.id && <p>You may lose access to some settings, and only someone with a higher role can change it back.</p>}
          </>
        )}
        onCancel={() => !changeRole.isPending && setDemote(null)} onConfirm={() => demote && changeRole.mutate(demote)} />
      <ConfirmDialog open={!!removing} danger busy={remove.isPending} title={removing ? `Remove ${removing.name}?` : ''} confirmLabel="Remove member"
        body={removing && <>They lose access immediately. Records they created stay in the workspace. You can invite <span className="t-strong">{removing.email}</span> again later.</>}
        onCancel={() => !remove.isPending && setRemoving(null)} onConfirm={() => removing && remove.mutate(removing)} />
    </div>
  )
}

function Invitations({ items }: { items: Invitation[] }) {
  const { toast } = useApp()
  const qc = useQueryClient()
  const resend = useResendInvite()
  const doResend = (i: Invitation) => resend.mutate({ _id: i.id }, {
    onSuccess: r => {
      qc.setQueryData<MembersData>(wk('members'), d => d && ({ ...d, invitations: d.invitations.map(x => (x.id === i.id ? { ...x, expiresAt: r.expiresAt } : x)) }))
      toast(`Invitation sent again to ${i.email}. The previous link no longer works.`)
    },
    // 429: resent moments ago — the server says when to try again.
    onError: e => toast(errorMessage(e), undefined, 'error'),
  })
  const revoke = useMutation({
    mutationFn: (i: Invitation) => request(ws(`/invitations/${i.id}`), { method: 'DELETE' }),
    onSuccess: (_r, i) => {
      qc.setQueryData<MembersData>(wk('members'), d => d && ({ ...d, invitations: d.invitations.filter(x => x.id !== i.id) }))
      toast(`Invitation to ${i.email} revoked`)
    },
    onError: e => toast(errorMessage(e), undefined, 'error'),
    onSettled: () => { void qc.invalidateQueries({ queryKey: wk('members') }); void qc.invalidateQueries({ queryKey: wk('audit') }) },
  })
  return (
    <section className="set-section" aria-labelledby="set-pending">
      <SectionHead title="Pending invitations" aside={<span className="t-small c3 num">{items.length}</span>} />
      <h2 className="sr-only" id="set-pending">Pending invitations</h2>
      {items.length === 0 ? (
        <div className="set-card set-quiet t-small c3">No pending invitations.</div>
      ) : (
        <ul className="set-card set-table" aria-label="Pending invitations">
          <AnimatePresence initial={false}>
            {items.map(i => {
              const d = daysFromToday(i.expiresAt)
              const busy = revoke.isPending && revoke.variables?.id === i.id
              const resending = resend.isPending && resend.variables?._id === i.id
              return (
                <motion.li key={i.id} className="inv-row" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, height: 0, transition: t.exit }} data-busy={busy || undefined}>
                  <span className="inv-ico" aria-hidden><Mail size={13} /></span>
                  <div className="grow">
                    <p className="t-strong truncate">{i.email}</p>
                    <p className="t-small c2">
                      {ROLE_LABEL[i.role]} · <span title={absTime(i.createdAt)}>sent {relTime(i.createdAt).toLowerCase()}</span> · <span title={absTime(i.expiresAt)} className={d <= 1 ? 'set-warn' : undefined}>{d <= 0 ? 'expires today' : `expires in ${d} day${d === 1 ? '' : 's'}`}</span>
                    </p>
                  </div>
                  <div className="inv-acts">
                    <Button variant="ghost" size="sm" icon={<RotateCw size={13} />} loading={resending} disabled={busy} onClick={() => doResend(i)} aria-label={`Resend invitation to ${i.email}`}>Resend</Button>
                    <Button variant="ghost" size="sm" icon={<X size={13} />} loading={busy} disabled={resending} onClick={() => revoke.mutate(i)} aria-label={`Revoke invitation to ${i.email}`}>Revoke</Button>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

function RoleLegend({ mine }: { mine: Role | null }) {
  return (
    <section className="set-section" aria-labelledby="set-roles">
      <div className="set-sec-head"><h2 className="t-heading grow" id="set-roles">Roles</h2><Link to="/settings/roles" className="t-small set-link">Full permissions table</Link></div>
      <dl className="set-card legend-list">
        {ROLES.map(r => (
          <div key={r} className="legend-row" data-mine={r === mine || undefined}>
            <dt className="t-strong">{ROLE_LABEL[r]}{r === mine && <span className="set-you">You</span>}</dt>
            <dd className="t-small c2">{ROLE_DESCRIPTION[r]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ── AI ────────────────────────────────────────────────────────────────────────
const wholeNumber = (min: number, max: number, unit: string) => z.string().trim().min(1, 'Required').regex(/^\d+$/, 'Use a whole number')
  .refine(v => Number(v) >= min && Number(v) <= max, `Use ${min.toLocaleString('en-GB')}–${max.toLocaleString('en-GB')} ${unit}`)
const aiSchema = z.object({
  enabled: z.boolean(),
  retentionDays: wholeNumber(0, 365, 'days'),
  monthlyTokenBudget: wholeNumber(0, 1_000_000_000, 'tokens'),
  perUserPerMinute: wholeNumber(1, 120, 'requests'),
  noContactDays: wholeNumber(7, 365, 'days'),
  dueSoonDays: wholeNumber(1, 60, 'days'),
  decisionStaleDays: wholeNumber(1, 180, 'days'),
  coolingPct: wholeNumber(5, 95, '%'),
})
type AIValues = z.input<typeof aiSchema>
const toAIValues = (s: AISettings): AIValues => ({
  enabled: s.enabled,
  retentionDays: String(s.retentionDays),
  monthlyTokenBudget: String(s.monthlyTokenBudget),
  perUserPerMinute: String(s.perUserPerMinute),
  noContactDays: String(s.thresholds.noContactDays),
  dueSoonDays: String(s.thresholds.dueSoonDays),
  decisionStaleDays: String(s.thresholds.decisionStaleDays),
  coolingPct: String(Math.round(s.thresholds.coolingRatio * 100)),
})
/** `/ai/status` reports this month's usage; accept either a token count or a `{ tokens }` summary. */
const monthTokenCount = (m: unknown) => (typeof m === 'number' ? m : typeof m === 'object' && m && typeof (m as { tokens?: unknown }).tokens === 'number' ? (m as { tokens: number }).tokens : 0)
const fmtInt = (n: number) => n.toLocaleString('en-GB')
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : fmtInt(n))
const FEATURE_LABEL: Record<string, string> = {
  copilot: 'Assistant', meeting_extraction: 'Meeting analysis', briefing_stakeholder: 'Stakeholder briefing', briefing_decision: 'Decision briefing', briefing_workspace: 'Workspace briefing',
}

const featureLabel = (f: string) => FEATURE_LABEL[f]
  ?? (f.startsWith('briefing_stakeholder_') ? `Stakeholder briefing (${f.slice('briefing_stakeholder_'.length)})` : f.replace(/_/g, ' '))

function AITab() {
  const status = useAIStatus()
  const { can } = useSession()
  return (
    <>
      <PageTitle title="AI" sub="Which engine powers briefings and the assistant, what it may spend, and the rules behind Home’s signals." />
      {status.isPending ? <GeneralSkeleton /> : status.isError ? <LoadError error={status.error} onRetry={() => void status.refetch()} /> : (
        <>
          <EngineSection s={status.data} />
          <AISettingsForm key={JSON.stringify(status.data.settings)} s={status.data} />
          {can('audit.read') && <UsageSection />}
        </>
      )}
    </>
  )
}

function EngineSection({ s }: { s: AIStatus }) {
  const local = s.engine.kind === 'local'
  return (
    <section className="set-section" aria-labelledby="set-ai-engine">
      <div className="set-sec-head"><h2 className="t-heading" id="set-ai-engine">Engine</h2></div>
      <div className="set-card">
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Current engine</span><span className="t-small c3">Set by your server configuration.</span></div>
          <div className="set-field-ctl">
            <div className="row gap-2">
              <span className="t-strong">{local ? 'Built-in rules engine' : s.engine.label}</span>
              <Pill tone={local ? 'neutral' : 'ai'}>{local ? 'Local' : 'Model'}</Pill>
              {!local && s.engine.model && <code className="mono aud-action">{s.engine.model}</code>}
            </div>
            <p className="t-small c2 set-mt">
              {local
                ? 'No model key configured — features use the built-in rules engine; no data leaves your server. Briefings show facts and rule-based items only, with no AI interpretation.'
                : 'Briefings and the assistant send the relevant records you can see to this model. AI interpretations are labelled and cite the records they rely on.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function AISettingsForm({ s }: { s: AIStatus }) {
  const { can } = useSession()
  const { toast } = useApp()
  const qc = useQueryClient()
  const update = useUpdateAISettings()
  const editable = can('workspace.update')
  const form = useForm(aiSchema, toAIValues(s.settings))
  const v = form.values as AIValues
  const used = monthTokenCount(s.month)
  const budget = s.settings.monthlyTokenBudget
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : used > 0 ? 100 : 0

  const save = async () => {
    const ok = await form.submit(async d => {
      const cur = s.settings
      const n = (x: string) => Number(x)
      const ratio = n(d.coolingPct) / 100
      const thresholds = {
        ...(n(d.noContactDays) !== cur.thresholds.noContactDays ? { noContactDays: n(d.noContactDays) } : {}),
        ...(n(d.dueSoonDays) !== cur.thresholds.dueSoonDays ? { dueSoonDays: n(d.dueSoonDays) } : {}),
        ...(n(d.decisionStaleDays) !== cur.thresholds.decisionStaleDays ? { decisionStaleDays: n(d.decisionStaleDays) } : {}),
        ...(Math.round(cur.thresholds.coolingRatio * 100) !== n(d.coolingPct) ? { coolingRatio: ratio } : {}),
      }
      // PATCH only what moved, so the audit trail names the fields that changed.
      const body = {
        ...(d.enabled !== cur.enabled ? { enabled: d.enabled } : {}),
        ...(n(d.retentionDays) !== cur.retentionDays ? { retentionDays: n(d.retentionDays) } : {}),
        ...(n(d.monthlyTokenBudget) !== cur.monthlyTokenBudget ? { monthlyTokenBudget: n(d.monthlyTokenBudget) } : {}),
        ...(n(d.perUserPerMinute) !== cur.perUserPerMinute ? { perUserPerMinute: n(d.perUserPerMinute) } : {}),
        ...(Object.keys(thresholds).length ? { thresholds } : {}),
      }
      const next = await update.mutateAsync(body)
      qc.setQueryData<AIStatus>(wk('ai', 'status'), old => (old ? { ...old, settings: next } : old))
      form.reset(toAIValues(next))
    })
    if (ok) toast('AI settings saved')
  }

  const num = (name: keyof AIValues, label: string, suffix: string, max?: number) => (
    <div className="ai-num">
      <TextField form={form} name={name} label={label} readOnly={!editable} inputMode="numeric" autoComplete="off" maxLength={max ?? 4} />
      <span className="t-small c3 ai-suffix">{suffix}</span>
    </div>
  )

  return (
    <form className="set-section" onSubmit={e => { e.preventDefault(); if (editable && form.dirty) void save() }} noValidate aria-label="AI settings">
      <SectionHead title="Settings" sub={editable ? undefined : (
        <span className="row gap-1"><Lock size={12} aria-hidden />Only administrators can change AI settings. You can see how they’re set.</span>
      )} />
      <div className="set-card">
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">AI features</span><span className="t-small c3">Briefings, meeting analysis and the assistant. Home’s rule-based signals stay on either way.</span></div>
          <div className="set-field-ctl">
            <label className="ai-switch">
              <input type="checkbox" role="switch" checked={!!v.enabled} disabled={!editable} onChange={e => form.set('enabled', e.target.checked)} />
              <span className="ai-switch-track" aria-hidden><i /></span>
              <span>{v.enabled ? 'On for this workspace' : 'Off for this workspace'}</span>
            </label>
          </div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Conversation history</span><span className="t-small c3">How long assistant conversations are kept. 0 means they are not stored.</span></div>
          <div className="set-field-ctl">
            {num('retentionDays', 'Retention in days', v.retentionDays === '0' ? 'not stored' : 'days')}
          </div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Monthly token budget</span><span className="t-small c3">Model calls stop for the month once it’s reached. The built-in rules engine is never limited by it.</span></div>
          <div className="set-field-ctl">
            {num('monthlyTokenBudget', 'Monthly token budget', 'tokens', 10)}
            <div className="ai-meter" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={Math.min(used, budget)} aria-label="Tokens used this month">
              <i style={{ width: `${pct}%` }} data-high={pct >= 85 || undefined} />
            </div>
            <p className="t-small c3 num">{fmtTokens(used)} of {fmtTokens(budget)} used this month ({budget > 0 ? `${Math.round((used / budget) * 100)}%` : 'no budget'})</p>
          </div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Requests per person</span><span className="t-small c3">Limit per member per minute, across all AI features.</span></div>
          <div className="set-field-ctl">{num('perUserPerMinute', 'Requests per minute', 'per minute', 3)}</div>
        </div>
      </div>

      <SectionHead title="Signal rules" sub="Thresholds for Home’s Needs attention list and briefings. These are fixed rules over your records, not predictions." />
      <div className="set-card">
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Contact window</span><span className="t-small c3">Period used to compare recent engagement with the one before it.</span></div>
          <div className="set-field-ctl">{num('noContactDays', 'Contact window in days', 'days', 3)}</div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Due soon</span><span className="t-small c3">Commitments and decisions due within this many days are flagged.</span></div>
          <div className="set-field-ctl">{num('dueSoonDays', 'Due soon in days', 'days', 2)}</div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Decision waiting</span><span className="t-small c3">Open decisions older than this are flagged even without a date.</span></div>
          <div className="set-field-ctl">{num('decisionStaleDays', 'Decision waiting in days', 'days', 3)}</div>
        </div>
        <div className="set-field-row">
          <div className="set-field-meta"><span className="t-strong">Cooling</span><span className="t-small c3">A high-influence relationship is cooling when recent engagements fall to this share of the previous window or below.</span></div>
          <div className="set-field-ctl">{num('coolingPct', 'Cooling threshold in percent', '% of previous window', 2)}</div>
        </div>
        {editable && (
          <div className="set-card-foot">
            <div className="grow"><FormError form={form} /></div>
            <AnimatePresence>
              {form.dirty && !form.submitting && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => form.reset(toAIValues(s.settings))}>Discard</Button>
                </motion.span>
              )}
            </AnimatePresence>
            <Button type="submit" variant="primary" size="sm" disabled={!form.dirty} loading={form.submitting}>{form.submitting ? 'Saving…' : 'Save changes'}</Button>
          </div>
        )}
      </div>
    </form>
  )
}

function UsageSection() {
  const q = useAIUsage()
  const rows = q.data?.rows ?? []
  const money = (micros: number, local: boolean) => (local ? '$0.00 (local)' : `$${(micros / 1e6).toFixed(micros > 0 && micros < 10_000 ? 4 : 2)}`)
  return (
    <section className="set-section" aria-labelledby="set-ai-usage">
      <SectionHead title="Usage" sub={<>Last 30 days, by feature. Usage records store counts and cost only — never prompts or answers.</>} />
      {q.isPending ? <div className="set-card set-skel" aria-busy="true"><div className="set-skel-row"><Skeleton w={110} h={11} /><Skeleton w="100%" h={11} /></div></div>
        : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} />
        : !rows.length ? <div className="set-card set-empty"><p className="t-strong">No AI usage yet</p><p className="t-small c2">Briefings, meeting analysis and assistant questions will be counted here.</p></div>
        : (
          <div className="set-card ai-usage-wrap" tabIndex={0} role="region" aria-label="AI usage by feature, last 30 days">
            <table className="ai-usage">
              <thead>
                <tr><th scope="col">Feature</th><th scope="col">Engine</th><th scope="col" className="r">Calls</th><th scope="col" className="r">Errors</th><th scope="col" className="r">Tokens in / out</th><th scope="col" className="r">Cost</th><th scope="col" className="r">Latency p50 / p95</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.feature}-${r.engine}`}>
                    <td>{featureLabel(r.feature)}</td>
                    <td className="c2">{r.engine === 'local' ? 'Rules engine' : 'Model'}</td>
                    <td className="r num">{fmtInt(r.calls)}</td>
                    <td className={`r num ${r.errors ? 'set-warn' : 'c3'}`}>{fmtInt(r.errors)}</td>
                    <td className="r num">{fmtTokens(r.input)} / {fmtTokens(r.output)}</td>
                    <td className="r num">{money(r.costMicros, r.engine === 'local')}</td>
                    <td className="r num c2">{fmtInt(r.p50)} / {fmtInt(r.p95)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function AuditTab() {
  const { can } = useSession()
  // The audit log is a plan feature: this tab explains a 402 inline, so the shell's prompt stays quiet.
  useHandlesPaymentRequired('plan_required:audit.log')
  return (
    <>
      <PageTitle title="Audit log" sub="Security-relevant events in this workspace: access, membership and settings changes." />
      {can('audit.read') ? <AuditList /> : (
        <div className="set-card set-empty">
          <span className="set-empty-ico" aria-hidden><Lock size={16} /></span>
          <p className="t-strong">Only administrators can view the audit log</p>
          <p className="t-small c2">Ask an owner or administrator if you need to review workspace activity.</p>
        </div>
      )}
    </>
  )
}

const ACTION_TEXT: Record<string, (m: Record<string, unknown>, who: (id: unknown) => string) => string> = {
  'workspace.created': () => 'created the workspace',
  'workspace.seeded': m => `loaded sample data${m.people ? ` (${m.people} people)` : ''}`,
  'workspace.settings_updated': m => `updated workspace settings${Array.isArray(m.fields) && m.fields.length ? ` (${(m.fields as string[]).join(', ')})` : ''}`,
  'member.invited': m => `invited ${m.email ?? 'someone'}${m.role ? ` as ${roleName(m.role)}` : ''}`,
  'member.joined': m => `joined the workspace${m.role ? ` as ${roleName(m.role)}` : ''}`,
  'member.role_changed': (m, who) => `changed ${who(m.userId)}’s role${m.from ? ` from ${roleName(m.from)}` : ''}${m.to ? ` to ${roleName(m.to)}` : ''}`,
  'member.removed': (m, who) => `removed ${who(m.userId)} from the workspace`,
  'member.left': () => 'left the workspace',
  'member.invitation_revoked': () => 'revoked an invitation',
  'stakeholder.restricted': () => 'restricted a stakeholder record',
  'stakeholder.unrestricted': () => 'lifted restrictions on a stakeholder record',
  'stakeholder.access_changed': m => `changed who can see a restricted stakeholder${typeof m.count === 'number' ? ` (${m.count} ${m.count === 1 ? 'person' : 'people'})` : ''}`,
  'auth.sign_in': () => 'signed in',
  'auth.sign_up': () => 'created an account',
}
const roleName = (r: unknown) => (typeof r === 'string' && r in ROLE_LABEL ? ROLE_LABEL[r as Role] : String(r))

function dayLabel(iso: string) {
  const d = daysFromToday(iso)
  if (d === 0) return 'Today'
  if (d === -1) return 'Yesterday'
  return fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function AuditList() {
  const members = useMembers()
  const q = useInfiniteQuery({
    queryKey: wk('audit'),
    initialPageParam: 0 as number,
    queryFn: ({ pageParam, signal }) => request<AuditPage>(ws(`/audit${pageParam ? `?before=${pageParam}` : ''}`), { signal }),
    getNextPageParam: last => last.next ?? undefined,
  })
  const names = useMemo(() => new Map(members.data?.members.map(m => [m.userId, m.name]) ?? []), [members.data])
  const who = (id: unknown) => (typeof id === 'string' && names.get(id)) || 'a member'
  const groups = useMemo(() => {
    const out: { label: string; events: AuditEvent[] }[] = []
    for (const e of q.data?.pages.flatMap(p => p.events) ?? []) {
      const label = dayLabel(e.createdAt)
      if (out[out.length - 1]?.label === label) out[out.length - 1].events.push(e)
      else out.push({ label, events: [e] })
    }
    return out
  }, [q.data])

  if (q.isPending) return (
    <div className="set-card set-table" aria-busy="true" aria-label="Loading audit log">
      {Array.from({ length: 7 }, (_, i) => <div key={i} className="aud-row"><Skeleton w={20} h={20} r={10} /><div className="grow col-gap"><Skeleton w={`${50 + (i * 13) % 35}%`} h={11} /><Skeleton w={120} h={10} /></div><Skeleton w={48} h={10} /></div>)}
    </div>
  )
  if (q.isError && q.error instanceof ApiError && q.error.status === 402 && q.error.code === 'plan_required') return <UpgradePrompt feature="audit.log" />
  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />
  if (!groups.length) return <div className="set-card set-empty"><p className="t-strong">No events yet</p><p className="t-small c2">Membership, access and settings changes will appear here.</p></div>

  return (
    <div className="aud">
      {groups.map(g => (
        <section key={g.label} className="aud-group" aria-label={g.label}>
          <h3 className="label-rule aud-day">{g.label}</h3>
          <ol className="set-card set-table">
            {g.events.map(e => {
              const m = e.metadata ?? {}
              const text = ACTION_TEXT[e.action]?.(m, who) ?? e.action.replace(/[._]/g, ' ')
              const actor = e.actor ?? 'System'
              const summary = metaSummary(e)
              return (
                <li key={e.id} className="aud-row">
                  <Avatar name={actor} size={20} />
                  <div className="grow">
                    <p className="aud-text"><span className="t-strong">{actor}</span> {text}
                      {e.entityType === 'stakeholder' && e.entityId && <> · <Link to={`/stakeholders/${e.entityId}`} className="set-link">View</Link></>}
                    </p>
                    <p className="aud-meta">
                      <code className="mono aud-action">{e.action}</code>
                      {summary && <span className="t-small c3 truncate">{summary}</span>}
                    </p>
                  </div>
                  <time className="t-small c3 num aud-time" dateTime={e.createdAt} title={absTime(e.createdAt)}>{relTime(e.createdAt)}</time>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      <div className="aud-more">
        {q.hasNextPage ? <Button size="sm" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Loading…' : 'Load older events'}</Button>
          : <span className="t-small c3">Beginning of the audit log</span>}
      </div>
    </div>
  )
}

/** Compact key=value summary of metadata the sentence didn't already say. */
function metaSummary(e: AuditEvent) {
  const m = e.metadata ?? {}
  const skip = new Set(['userId', 'email', 'role', 'from', 'to', 'fields', 'count', 'people'])
  const parts = Object.entries(m).filter(([k, v]) => !skip.has(k) && v != null && typeof v !== 'object').map(([k, v]) => `${k}: ${String(v)}`)
  // Membership/invitation events already name who in the sentence; other entities get a short reference.
  if (e.entityType && !['workspace', 'session', 'user', 'membership', 'invitation'].includes(e.entityType) && e.entityId) parts.unshift(`${e.entityType} ${e.entityId.slice(0, 8)}`)
  return parts.join(' · ')
}

