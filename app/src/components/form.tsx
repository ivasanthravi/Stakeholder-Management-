// Form primitives. Validation uses the same Zod schemas as the server; server field errors map back
// onto fields; a failed submit never clears what the user typed.
import { useCallback, useId, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import type { z } from 'zod'
import { AlertCircle } from 'lucide-react'
import { ApiError, NetworkError } from '../api/http'
import { STANCE_LABEL, LEVEL_LABEL } from '../lib/format'
import { StanceBadge, LevelMeter } from './ui'
import type { Level, Stance } from '../api/types'
import './form.css'

type AnyObj = Record<string, unknown>

export function useForm<S extends z.ZodType<AnyObj>>(schema: S, initial: z.input<S>) {
  const [values, setValues] = useState<AnyObj>(initial as AnyObj)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const initialRef = useRef(JSON.stringify(initial))
  const inFlight = useRef(false)

  const validate = useCallback((v: AnyObj): { ok: true; data: unknown; errors: Record<string, string> } | { ok: false; errors: Record<string, string> } => {
    const r = schema.safeParse(v)
    if (r.success) return { ok: true, data: r.data, errors: {} }
    const errs: Record<string, string> = {}
    for (const i of r.error.issues) errs[i.path.join('.')] ??= i.message
    return { ok: false, errors: errs }
  }, [schema])

  const set = useCallback((name: string, v: unknown) => {
    setValues(prev => {
      const next = { ...prev, [name]: v }
      // Re-validate a field that already shows an error so it clears as soon as it's fixed.
      setErrors(e => (e[name] ? { ...e, [name]: validate(next).errors[name] ?? '' } : e))
      return next
    })
  }, [validate])

  const blur = useCallback((name: string) => {
    setTouched(t => ({ ...t, [name]: true }))
    setErrors(e => ({ ...e, [name]: validate(values).errors[name] ?? '' }))
  }, [validate, values])

  /** Validates, then runs `fn`. Guards double submission; maps server errors onto fields. */
  const submit = useCallback(async (fn: (data: z.output<S>) => Promise<unknown>) => {
    if (inFlight.current) return false
    const r = validate(values)
    if (!r.ok) {
      setErrors(r.errors)
      setTouched(Object.fromEntries(Object.keys(r.errors).map(k => [k, true])))
      setFormError('Some fields need attention')
      return false
    }
    inFlight.current = true
    setSubmitting(true); setFormError(null)
    try {
      await fn(r.data as z.output<S>)
      initialRef.current = JSON.stringify(values)
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        if (Object.keys(e.fields).length) setErrors(e.fields)
        setFormError(e.isConflict ? 'Someone else changed this record while you were editing. Your edits are kept — review and save again to overwrite.' : e.message)
      } else if (e instanceof NetworkError) setFormError('You’re offline. Your changes are kept here — try again when you’re back online.')
      else setFormError('Something went wrong. Your changes are kept — try again.')
      return false
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [validate, values])

  const dirty = useMemo(() => JSON.stringify(values) !== initialRef.current, [values])
  const reset = useCallback((v: z.input<S>) => { setValues(v as AnyObj); initialRef.current = JSON.stringify(v); setErrors({}); setTouched({}); setFormError(null) }, [])
  const error = (name: string) => (touched[name] || errors[name] ? errors[name] || undefined : undefined)

  return { values, set, blur, submit, errors, error, submitting, formError, setFormError, dirty, reset }
}
/** What field components need from a form (independent of its schema). */
export interface Form {
  values: AnyObj
  set: (name: string, v: unknown) => void
  blur: (name: string) => void
  error: (name: string) => string | undefined
  formError: string | null
}

export function Field({ label, hint, error, children, required, id, inline }: { label: string; hint?: ReactNode; error?: string; children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; required?: boolean; id?: string; inline?: boolean }) {
  const auto = useId()
  const fid = id ?? auto
  const describedBy = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined
  return (
    <div className={`field ${inline ? 'field-inline' : ''}`} data-invalid={error ? true : undefined}>
      <label htmlFor={fid} className="field-label">{label}{required && <span className="field-req">Required</span>}</label>
      {children({ id: fid, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? <p className="field-error" id={`${fid}-err`} role="alert"><AlertCircle size={12} />{error}</p>
        : hint ? <p className="field-hint" id={`${fid}-hint`}>{hint}</p> : null}
    </div>
  )
}

type Bind = { form: Form; name: string }
const str = (v: unknown) => (v == null ? '' : String(v))

export function TextField({ form, name, label, hint, required, ...rest }: Bind & { label: string; hint?: ReactNode; required?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'form' | 'name'>) {
  return (
    <Field label={label} hint={hint} error={form.error(name)} required={required}>
      {p => <input {...p} {...rest} className="input" value={str(form.values[name])} onChange={e => form.set(name, e.target.value)} onBlur={() => form.blur(name)} />}
    </Field>
  )
}

export function TextArea({ form, name, label, hint, rows = 4, ...rest }: Bind & { label: string; hint?: ReactNode } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'form' | 'name'>) {
  return (
    <Field label={label} hint={hint} error={form.error(name)}>
      {p => <textarea {...p} {...rest} rows={rows} className="input textarea" value={str(form.values[name])} onChange={e => form.set(name, e.target.value)} onBlur={() => form.blur(name)} />}
    </Field>
  )
}

export function SelectField({ form, name, label, options, hint, placeholder, required }: Bind & { label: string; options: { value: string; label: string }[]; hint?: ReactNode; placeholder?: string; required?: boolean }) {
  return (
    <Field label={label} hint={hint} error={form.error(name)} required={required}>
      {p => (
        <div className="select-wrap">
          <select {...p} className="input select" value={str(form.values[name])} onChange={e => form.set(name, e.target.value || null)} onBlur={() => form.blur(name)}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
    </Field>
  )
}

export function DateField({ form, name, label, hint }: Bind & { label: string; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint} error={form.error(name)}>
      {p => <input {...p} type="date" className="input" value={str(form.values[name])} onChange={e => form.set(name, e.target.value || null)} onBlur={() => form.blur(name)} />}
    </Field>
  )
}

/** 1–4 scale as a segmented radio group (keyboard: arrows). */
export function LevelField({ form, name, label }: Bind & { label: string }) {
  const v = form.values[name] as number | null | undefined
  const gid = useId()
  return (
    <div className="field">
      <span className="field-label" id={gid}>{label}</span>
      <div className="level-seg" role="radiogroup" aria-labelledby={gid}>
        {[1, 2, 3, 4].map(n => (
          <button key={n} type="button" role="radio" aria-checked={v === n} className="level-opt"
            onClick={() => form.set(name, v === n ? null : n)}
            onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); form.set(name, Math.min(4, (v ?? 0) + 1)) } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); form.set(name, Math.max(1, (v ?? 2) - 1)) } }}>
            <LevelMeter value={n as Level} label={label} />
            <span>{LEVEL_LABEL[n]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function StanceField({ form, name, label = 'Stance' }: Bind & { label?: string }) {
  const v = (form.values[name] as Stance) ?? 'unknown'
  const gid = useId()
  return (
    <div className="field">
      <span className="field-label" id={gid}>{label}</span>
      <div className="stance-seg" role="radiogroup" aria-labelledby={gid}>
        {(['opposed', 'concerned', 'neutral', 'supporter', 'champion', 'unknown'] as Stance[]).map(s => (
          <button key={s} type="button" role="radio" aria-checked={v === s} className="stance-opt" onClick={() => form.set(name, s)} title={STANCE_LABEL[s]}>
            <StanceBadge stance={s} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Comma/Enter separated tags. */
export function TagField({ form, name, label, hint }: Bind & { label: string; hint?: ReactNode }) {
  const tags = (form.values[name] as string[]) ?? []
  const [draft, setDraft] = useState('')
  const add = (t: string) => { const v = t.trim(); if (v && !tags.includes(v)) form.set(name, [...tags, v]); setDraft('') }
  return (
    <Field label={label} hint={hint} error={form.error(name)}>
      {p => (
        <div className="input tag-input" onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
          {tags.map(t => <span key={t} className="tag-chip">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => form.set(name, tags.filter(x => x !== t))}>×</button></span>)}
          <input {...p} value={draft} onChange={e => setDraft(e.target.value)} placeholder={tags.length ? '' : 'Type and press Enter'}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) } else if (e.key === 'Backspace' && !draft && tags.length) form.set(name, tags.slice(0, -1)) }}
            onBlur={() => { if (draft) add(draft); form.blur(name) }} />
        </div>
      )}
    </Field>
  )
}

export function FormError({ form }: { form: Form }) {
  if (!form.formError) return null
  return <div className="form-error" role="alert"><AlertCircle size={14} /><span>{form.formError}</span></div>
}
