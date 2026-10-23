// Create/edit drawers for every record type. One pattern everywhere: minimal required fields up front,
// the rest behind "More details"; server validation errors land on the right field; drafts survive failures.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { z } from 'zod'
import { useApp, type CreateKind } from '../shell/context'
import { useSession } from '../session/session'
import { newIdempotencyKey, request, ws } from '../api/http'
import { useInvalidate } from '../api/hooks'
import { Drawer, DrawerActions } from '../components/Drawer'
import { DateField, FormError, LevelField, SelectField, StanceField, TagField, TextArea, TextField, useForm, type Form } from '../components/form'
import { InitiativePicker, MemberPicker, OrganizationPicker, StakeholderPicker } from './pickers'
import {
  COMMITMENT_STATUSES, DECISION_STATUSES, ENGAGEMENT_KINDS, ENGAGEMENT_STATUSES, INITIATIVE_STATUSES, ORG_TYPES, STAKEHOLDER_TYPES, STANCES,
  commitmentCreateSchema, decisionCreateSchema, initiativeCreateSchema, organizationCreateSchema, stakeholderCreateSchema,
} from '../../shared/schemas'
import { COMMITMENT_STATUS_LABEL, DECISION_STATUS_LABEL, ENGAGEMENT_KIND_LABEL, INITIATIVE_STATUS_LABEL, ORG_TYPE_LABEL, isoToday } from '../lib/format'

type Rec = Record<string, unknown> & { id?: string; version?: number }
interface DrawerProps { open: boolean; onClose: () => void; record?: Rec | null; defaults?: Record<string, unknown>; onSaved?: (rec: { id: string }) => void }

const opts = (vals: readonly string[], labels: Record<string, string>) => vals.map(v => ({ value: v, label: labels[v] ?? v.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) }))

function Disclosure({ label, children, defaultOpen }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="form-section">
      <button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{label}</button>
      {open && children}
    </div>
  )
}

/** Shared save: POST (with idempotency key) or PATCH (with version), then invalidate and report. */
function useSave(resource: string, record: Rec | null | undefined, label: string, onSaved?: (r: { id: string }) => void) {
  const invalidate = useInvalidate()
  const { toast } = useApp()
  const [key] = useState(newIdempotencyKey)
  return async (body: Record<string, unknown>) => {
    const saved = record?.id
      ? await request<{ id: string }>(ws(`/${resource}/${record.id}`), { method: 'PATCH', body: { ...body, version: record.version } })
      : await request<{ id: string }>(ws(`/${resource}`), { method: 'POST', body, idempotencyKey: key })
    await invalidate()
    toast(record?.id ? `${label} saved` : `${label} created`)
    onSaved?.(saved)
    return saved
  }
}

// ── Stakeholder ──────────────────────────────────────────────────────────────
const stakeholderFormSchema = stakeholderCreateSchema.extend({ orgId: z.string().nullable().optional(), orgRole: z.string().max(120).nullable().optional() })
export function StakeholderDrawer({ open, onClose, record, defaults, onSaved }: DrawerProps) {
  const editing = !!record?.id
  const init = () => ({
    name: '', title: '', email: '', phone: '', location: '', stakeholderType: 'individual', influence: null, interest: null, stance: 'unknown',
    engagementStatus: 'not_engaged', tags: [], notes: '', ownerId: null, customFields: {}, organizations: [], initiativeIds: [], orgId: null, orgRole: '',
    ...defaults, ...(record ?? {}),
  }) as z.input<typeof stakeholderFormSchema>
  const form = useForm(stakeholderFormSchema, init())
  useEffect(() => { if (open) form.reset(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave('stakeholders', record, 'Stakeholder', onSaved)
  const submit = () => form.submit(async v => {
    const { orgId, orgRole, organizations, initiativeIds, ...rest } = v
    const body = editing ? rest : { ...rest, organizations: orgId ? [{ organizationId: orgId, role: orgRole || null, isPrimary: true }] : organizations, initiativeIds }
    if (editing) { delete (body as Record<string, unknown>).customFields }
    await save(body); onClose()
  })
  return (
    <Drawer open={open} onClose={onClose} title={editing ? `Edit ${String(record?.name ?? 'stakeholder')}` : 'New stakeholder'} dirty={form.dirty} onSubmit={submit}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label={editing ? 'Save changes' : 'Create stakeholder'} />}>
      <div className="form-grid">
        <div className="span-2"><TextField form={form} name="name" label="Name" required autoFocus /></div>
        <TextField form={form} name="title" label="Role / title" />
        {!editing ? <OrganizationPicker value={(form.values.orgId as string) ?? null} onChange={v => form.set('orgId', v)} /> : <TextField form={form} name="location" label="Location" />}
        {!editing && !!form.values.orgId && <div className="span-2"><TextField form={form} name="orgRole" label="Role at organization" placeholder="e.g. Chief Planner" /></div>}
      </div>
      <div className="form-grid">
        <LevelField form={form} name="influence" label="Influence" />
        <LevelField form={form} name="interest" label="Interest" />
        <div className="span-2"><StanceField form={form} name="stance" /></div>
        <MemberPicker form={form} name="ownerId" label="Relationship owner" />
        {!editing && <InitiativePicker form={form} name="initiativeIds" label="Initiatives" multi />}
      </div>
      <Disclosure label="Contact & more details" defaultOpen={editing}>
        <div className="form-grid">
          <TextField form={form} name="email" label="Email" type="email" />
          <TextField form={form} name="phone" label="Phone" />
          {!editing && <TextField form={form} name="location" label="Location" />}
          <SelectField form={form} name="stakeholderType" label="Stakeholder type" options={opts(STAKEHOLDER_TYPES, {})} />
          <SelectField form={form} name="engagementStatus" label="Engagement status" options={opts(ENGAGEMENT_STATUSES, { do_not_contact: 'Do not contact' })} />
          <div className="span-2"><TagField form={form} name="tags" label="Tags" /></div>
          <div className="span-2"><TextArea form={form} name="notes" label="Notes" rows={4} /></div>
        </div>
      </Disclosure>
      <FormError form={form} />
    </Drawer>
  )
}

// ── Organization ─────────────────────────────────────────────────────────────
export function OrganizationDrawer({ open, onClose, record, defaults, onSaved }: DrawerProps) {
  const editing = !!record?.id
  const init = () => ({ name: '', shortName: '', type: 'other', website: '', description: '', tags: [], ...defaults, ...(record ?? {}) }) as z.input<typeof organizationCreateSchema>
  const form = useForm(organizationCreateSchema, init())
  useEffect(() => { if (open) form.reset(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave('organizations', record, 'Organization', onSaved)
  const submit = () => form.submit(async v => { await save(v); onClose() })
  return (
    <Drawer open={open} onClose={onClose} title={editing ? `Edit ${String(record?.name)}` : 'New organization'} subtitle="Companies, public bodies, departments, community groups — anything people belong to." dirty={form.dirty} onSubmit={submit}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label={editing ? 'Save changes' : 'Create organization'} />}>
      <div className="form-grid">
        <div className="span-2"><TextField form={form} name="name" label="Name" required autoFocus /></div>
        <TextField form={form} name="shortName" label="Short name" placeholder="e.g. WCC" hint="Shown in dense views" />
        <SelectField form={form} name="type" label="Type" options={opts(ORG_TYPES, ORG_TYPE_LABEL)} />
        <div className="span-2"><TextField form={form} name="website" label="Website" placeholder="https://" /></div>
        <div className="span-2"><TagField form={form} name="tags" label="Classifications" hint="Free-form, e.g. statutory consultee, funder, landowner" /></div>
        <div className="span-2"><TextArea form={form} name="description" label="Description" rows={3} /></div>
      </div>
      <FormError form={form} />
    </Drawer>
  )
}

// ── Initiative ───────────────────────────────────────────────────────────────
export function InitiativeDrawer({ open, onClose, record, defaults, onSaved }: DrawerProps) {
  const editing = !!record?.id
  const init = () => ({ code: '', name: '', description: '', status: 'active', ownerId: null, startDate: null, endDate: null, ...defaults, ...(record ?? {}) }) as z.input<typeof initiativeCreateSchema>
  const form = useForm(initiativeCreateSchema, init())
  useEffect(() => { if (open) form.reset(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave('initiatives', record, 'Initiative', onSaved)
  const submit = () => form.submit(async v => { await save(v); onClose() })
  return (
    <Drawer open={open} onClose={onClose} title={editing ? `Edit ${String(record?.code)}` : 'New initiative'} subtitle="A project, programme, policy or engagement effort that stakeholders are connected to." dirty={form.dirty} onSubmit={submit}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label={editing ? 'Save changes' : 'Create initiative'} />}>
      <div className="form-grid">
        <TextField form={form} name="code" label="Code" required placeholder="NRL" hint="2–8 letters or numbers" autoFocus />
        <SelectField form={form} name="status" label="Status" options={opts(INITIATIVE_STATUSES, INITIATIVE_STATUS_LABEL)} />
        <div className="span-2"><TextField form={form} name="name" label="Name" required /></div>
        <MemberPicker form={form} name="ownerId" label="Owner" />
        <span />
        <DateField form={form} name="startDate" label="Start" />
        <DateField form={form} name="endDate" label="End" />
        <div className="span-2"><TextArea form={form} name="description" label="Description" rows={3} /></div>
      </div>
      <FormError form={form} />
    </Drawer>
  )
}

// ── Engagement ───────────────────────────────────────────────────────────────
const toLocal = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
const engagementFormSchema = z.object({
  kind: z.enum(ENGAGEMENT_KINDS),
  title: z.string().trim().min(1, 'Required').max(200),
  when: z.string().min(1, 'Required').refine(v => !Number.isNaN(Date.parse(v)), 'Enter a date and time'),
  initiativeId: z.string().nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  notes: z.string().max(50000).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  participantIds: z.array(z.string()).max(100),
  location: z.string().max(200).optional(),
})
export function EngagementDrawer({ open, onClose, record, defaults, onSaved }: DrawerProps) {
  const editing = !!record?.id
  const nav = useNavigate()
  const r = record as (Rec & { occurredAt?: string; participants?: { id: string; name: string }[]; details?: { location?: string } }) | null | undefined
  const init = () => ({
    kind: 'meeting', title: '', when: toLocal(r?.occurredAt), initiativeId: null, summary: '', notes: '', ownerId: null,
    participantIds: r?.participants?.map(p => p.id) ?? [], location: r?.details?.location ?? '', ...defaults, ...(r ? { kind: r.kind, title: r.title, initiativeId: r.initiativeId, summary: r.summary ?? '', notes: r.notes ?? '', ownerId: r.ownerId } : {}),
  }) as z.input<typeof engagementFormSchema>
  const form = useForm(engagementFormSchema, init())
  useEffect(() => { if (open) form.reset(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave('engagements', record, 'Engagement', onSaved)
  const submit = () => form.submit(async v => {
    const { when, location, ...rest } = v
    const saved = await save({ ...rest, occurredAt: new Date(when).toISOString(), summary: rest.summary || null, notes: rest.notes || null, details: location ? { location } : {} })
    onClose()
    if (!editing) nav(`/engagements/${saved.id}`)
  })
  const initialPeople = (r?.participants ?? (defaults?.participantOptions as { id: string; name: string }[] | undefined) ?? []).map(p => ({ value: p.id, label: p.name }))
  return (
    <Drawer open={open} onClose={onClose} title={editing ? `Edit ${String(r?.key ?? 'engagement')}` : 'Log engagement'} dirty={form.dirty} onSubmit={submit} width={560}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label={editing ? 'Save changes' : 'Log engagement'} />}>
      <div className="form-grid">
        <SelectField form={form} name="kind" label="Type" options={opts(ENGAGEMENT_KINDS, ENGAGEMENT_KIND_LABEL)} />
        <TextField form={form} name="when" label="When" type="datetime-local" required />
        <div className="span-2"><TextField form={form} name="title" label="Title" required placeholder="e.g. Planning liaison — Westshire County Council" autoFocus /></div>
        <div className="span-2"><StakeholderPicker form={form} name="participantIds" label="Participants" multi initialOptions={initialPeople} /></div>
        <InitiativePicker form={form} name="initiativeId" />
        <MemberPicker form={form} name="ownerId" label="Owner" hint="Defaults to you" />
        <div className="span-2"><TextArea form={form} name="summary" label="Summary" rows={2} placeholder="One or two sentences others will see in timelines" /></div>
        <div className="span-2"><TextArea form={form} name="notes" label="Notes" rows={8} placeholder="Full notes. You can turn sentences into commitments or decisions after saving." /></div>
        {form.values.kind === 'meeting' && <div className="span-2"><TextField form={form} name="location" label="Location" /></div>}
      </div>
      <FormError form={form} />
    </Drawer>
  )
}

// ── Decision ─────────────────────────────────────────────────────────────────
const decisionFormSchema = decisionCreateSchema.omit({ stakeholders: true }).extend({ approverIds: z.array(z.string()).default([]), consultedIds: z.array(z.string()).default([]) })
export function DecisionDrawer({ open, onClose, record, defaults, onSaved }: DrawerProps) {
  const editing = !!record?.id
  const { can } = useSession()
  const r = record as (Rec & { stakeholders?: { id: string; name: string; role: string }[] }) | null | undefined
  const init = () => ({
    title: '', description: '', context: '', initiativeId: null, ownerId: null, status: 'proposed', dueDate: null, outcome: '', sourceEngagementId: null,
    approverIds: r?.stakeholders?.filter(s => s.role === 'approver').map(s => s.id) ?? [], consultedIds: r?.stakeholders?.filter(s => s.role !== 'approver').map(s => s.id) ?? [],
    ...defaults, ...(r ? { title: r.title, description: r.description ?? '', context: r.context ?? '', initiativeId: r.initiativeId, ownerId: r.ownerId, status: r.status, dueDate: r.dueDate, outcome: r.outcome ?? '' } : {}),
  }) as z.input<typeof decisionFormSchema>
  const form = useForm(decisionFormSchema, init())
  useEffect(() => { if (open) form.reset(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave('decisions', record, 'Decision', onSaved)
  const submit = () => form.submit(async v => {
    const { approverIds, consultedIds, ...rest } = v
    const stakeholders = [...approverIds.map(id => ({ stakeholderId: id, role: 'approver' })), ...consultedIds.filter(id => !approverIds.includes(id)).map(id => ({ stakeholderId: id, role: 'consulted' }))]
    await save({ ...rest, stakeholders }); onClose()
  })
  const decided = form.values.status === 'approved' || form.values.status === 'rejected'
  const people = (r?.stakeholders ?? []).map(s => ({ value: s.id, label: s.name }))
  return (
    <Drawer open={open} onClose={onClose} title={editing ? `Edit ${String(r?.key)}` : 'Record decision'} dirty={form.dirty} onSubmit={submit} width={560}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label={editing ? 'Save changes' : 'Record decision'} />}>
      <div className="form-grid">
        <div className="span-2"><TextField form={form} name="title" label="Decision" required autoFocus placeholder="e.g. Preferred alignment through Marlow Fen" /></div>
        <SelectField form={form} name="status" label="Status" options={opts(DECISION_STATUSES, DECISION_STATUS_LABEL).filter(o => can('decision.update') || o.value === 'proposed')} hint={can('decision.update') ? undefined : 'Contributors can propose; managers decide'} />
        <DateField form={form} name="dueDate" label="Decision needed by" />
        <InitiativePicker form={form} name="initiativeId" />
        <MemberPicker form={form} name="ownerId" label="Decision owner" hint="Defaults to you" />
        <div className="span-2"><StakeholderPicker form={form} name="approverIds" label="Approvers" multi initialOptions={people} /></div>
        <div className="span-2"><StakeholderPicker form={form} name="consultedIds" label="Consulted / affected" multi initialOptions={people} /></div>
        <div className="span-2"><TextArea form={form} name="description" label="What is being decided" rows={3} /></div>
        <div className="span-2"><TextArea form={form} name="context" label="Supporting context" rows={3} hint="Options considered, constraints, evidence" /></div>
        {(decided || editing) && <div className="span-2"><TextArea form={form} name="outcome" label="Outcome" rows={3} /></div>}
      </div>
      <FormError form={form} />
    </Drawer>
  )
}

// ── Commitment ───────────────────────────────────────────────────────────────
export function CommitmentDrawer({ open, onClose, record, defaults, onSaved }: DrawerProps) {
  const editing = !!record?.id
  const r = record as (Rec & { stakeholder?: { id: string; name: string } | null }) | null | undefined
  const init = () => ({
    title: '', description: '', ownerId: null, stakeholderId: null, initiativeId: null, direction: 'ours', dueDate: isoToday(7), status: 'open', sourceEngagementId: null,
    ...defaults, ...(r ? { title: r.title, description: r.description ?? '', ownerId: r.ownerId, stakeholderId: r.stakeholderId, initiativeId: r.initiativeId, direction: r.direction, dueDate: r.dueDate, status: r.status } : {}),
  }) as z.input<typeof commitmentCreateSchema>
  const form = useForm(commitmentCreateSchema, init())
  useEffect(() => { if (open) form.reset(init()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave('commitments', record, 'Commitment', onSaved)
  const submit = () => form.submit(async v => { await save(v); onClose() })
  const people = [r?.stakeholder, defaults?.stakeholderOption as { id: string; name: string } | undefined].filter(Boolean).map(s => ({ value: s!.id, label: s!.name }))
  return (
    <Drawer open={open} onClose={onClose} title={editing ? `Edit ${String(r?.key)}` : 'New commitment'} subtitle="An agreed obligation between your team and a stakeholder — not a general task." dirty={form.dirty} onSubmit={submit}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label={editing ? 'Save changes' : 'Create commitment'} />}>
      <div className="form-grid">
        <div className="span-2"><TextField form={form} name="title" label="Commitment" required autoFocus placeholder="e.g. Share the revised noise survey" /></div>
        <div className="span-2"><StakeholderPicker form={form} name="stakeholderId" label="With stakeholder" initialOptions={people} /></div>
        <SelectField form={form} name="direction" label="Who owes it" options={[{ value: 'ours', label: 'We owe them' }, { value: 'theirs', label: 'They owe us' }]} />
        <DateField form={form} name="dueDate" label="Due" />
        <MemberPicker form={form} name="ownerId" label="Accountable owner" hint="Defaults to you" />
        <InitiativePicker form={form} name="initiativeId" />
        {editing && <SelectField form={form} name="status" label="Status" options={opts(COMMITMENT_STATUSES, COMMITMENT_STATUS_LABEL)} />}
        <div className="span-2"><TextArea form={form} name="description" label="Details" rows={3} /></div>
      </div>
      <FormError form={form} />
    </Drawer>
  )
}

/** Global host for create requests (palette, shortcuts, empty states). */
export function CreateDrawers() {
  const { create, closeCreate } = useApp()
  const kind = create?.kind
  const props = (k: CreateKind) => ({ open: kind === k, onClose: closeCreate, defaults: create?.defaults, onSaved: create?.onCreated })
  return (
    <>
      <StakeholderDrawer {...props('stakeholder')} />
      <OrganizationDrawer {...props('organization')} />
      <InitiativeDrawer {...props('initiative')} />
      <EngagementDrawer {...props('engagement')} />
      <DecisionDrawer {...props('decision')} />
      <CommitmentDrawer {...props('commitment')} />
    </>
  )
}

export type { Form }
export { STANCES }
