import { useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useList, useLookups } from '../api/hooks'
import type { StakeholderRow } from '../api/types'
import { Field } from '../components/form'
import { Picker, type PickerOption } from '../components/Picker'
import { Avatar } from '../components/ui'
import type { Form } from '../components/form'

export function MemberPicker({ form, name, label = 'Owner', hint, placeholder }: { form: Form; name: string; label?: string; hint?: string; placeholder?: string }) {
  const { data } = useLookups()
  const options = useMemo<PickerOption[]>(() => (data?.members ?? []).map(m => ({ value: m.id, label: m.name, sub: m.email, icon: <Avatar name={m.name} size={18} internal /> })), [data])
  return (
    <Field label={label} hint={hint} error={form.error(name)}>
      {p => <Picker id={p.id} describedBy={p['aria-describedby']} invalid={!!p['aria-invalid']} options={options} value={(form.values[name] as string) ?? null} onChange={v => form.set(name, v)} placeholder={placeholder ?? (hint === 'Defaults to you' ? 'You' : 'Unassigned')} />}
    </Field>
  )
}

export function InitiativePicker({ form, name, label = 'Initiative', multi }: { form: Form; name: string; label?: string; multi?: boolean }) {
  const { data } = useLookups()
  const options = useMemo<PickerOption[]>(() => (data?.initiatives ?? []).map(i => ({ value: i.id, label: i.name, sub: i.code, icon: <span className="pal-code mono">{i.code}</span> })), [data])
  return (
    <Field label={label} error={form.error(name)}>
      {p => <Picker id={p.id} multi={multi} options={options} value={(form.values[name] as string | string[]) ?? (multi ? [] : null)} onChange={v => form.set(name, v)} placeholder={multi ? 'Add initiatives' : 'None'} emptyText="No initiatives yet" />}
    </Field>
  )
}

export function OrganizationPicker({ value, onChange, id, label = 'Organization', error }: { value: string | null; onChange: (v: string | null) => void; id?: string; label?: string; error?: string }) {
  const { data } = useLookups()
  const options = useMemo<PickerOption[]>(() => (data?.organizations ?? []).map(o => ({ value: o.id, label: o.name, sub: o.shortName ?? undefined, icon: <Building2 size={13} className="c3" /> })), [data])
  return (
    <Field label={label} error={error} id={id}>
      {p => <Picker id={p.id} options={options} value={value} onChange={v => onChange(v as string | null)} placeholder="Search organizations" emptyText="No matching organization" />}
    </Field>
  )
}

/** Stakeholders are a large set: search server-side as the user types. */
export function StakeholderPicker({ form, name, label, multi, hint, initialOptions = [] }: { form: Form; name: string; label: string; multi?: boolean; hint?: string; initialOptions?: PickerOption[] }) {
  const [q, setQ] = useState('')
  const list = useList<StakeholderRow>('stakeholders', { q, limit: 20, sort: q ? 'name' : 'influence' })
  const [known, setKnown] = useState<PickerOption[]>(initialOptions)
  const options = useMemo<PickerOption[]>(() => (list.data?.items ?? []).map(s => ({ value: s.id, label: s.name, sub: s.primaryOrg?.shortName ?? s.title ?? undefined, icon: <Avatar name={s.name} size={18} /> })), [list.data])
  return (
    <Field label={label} hint={hint} error={form.error(name)}>
      {p => (
        <Picker id={p.id} multi={multi} options={options} loading={list.isFetching} onQuery={setQ} selectedOptions={known}
          value={(form.values[name] as string | string[]) ?? (multi ? [] : null)}
          onChange={v => {
            const ids = Array.isArray(v) ? v : v ? [v] : []
            setKnown(k => [...k, ...options.filter(o => ids.includes(o.value) && !k.some(x => x.value === o.value))])
            form.set(name, v)
          }}
          placeholder={multi ? 'Search people' : 'Search stakeholders'} emptyText={q ? 'No matching stakeholder' : 'Type to search'} />
      )}
    </Field>
  )
}
