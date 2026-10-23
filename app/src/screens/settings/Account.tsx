// Account tabs: profile, notifications & privacy, security. These are about the signed-in person, not the workspace.
import { useEffect, useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, KeyRound, Laptop, Lock, LogOut, ShieldCheck, Smartphone } from 'lucide-react'
import { account, usePreferences, type Preferences } from '../../api/commercial'
import { errorMessage } from '../../api/http'
import { Avatar, Button, Pill, Skeleton } from '../../components/ui'
import { ConfirmDialog } from '../../components/Drawer'
import { useSession } from '../../session/session'
import { useApp } from '../../shell/context'
import { LoadError } from '../Home'
import { absTime, FieldRow, PageTitle, relTime, SectionHead, Switch } from './common'

// ── Profile ───────────────────────────────────────────────────────────────────
export function ProfileTab() {
  const { me, refresh } = useSession()
  const { toast } = useApp()
  const [name, setName] = useState(me?.user.name ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const id = useId()
  useEffect(() => { if (me) setName(me.user.name) }, [me?.user.name]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null
  const dirty = name.trim() !== me.user.name
  const save = async () => {
    const v = name.trim()
    if (!v) { setErr('Enter your name'); return }
    if (v.length > 80) { setErr('Keep it to 80 characters or fewer'); return }
    setSaving(true); setErr(null)
    try { await account.updateProfile(v); await refresh(); toast('Profile updated') }
    catch (e) { setErr(errorMessage(e)) }
    finally { setSaving(false) }
  }
  return (
    <>
      <PageTitle title="My profile" sub="How you appear to people in your workspaces." />
      <form className="set-section" onSubmit={e => { e.preventDefault(); if (dirty) void save() }} noValidate aria-label="Profile">
        <div className="set-card">
          <div className="prof-head">
            <Avatar name={name.trim() || me.user.name} size={48} seed={me.user.id} />
            <div className="grow">
              <p className="t-heading">{name.trim() || me.user.name}</p>
              <p className="t-small c2">{me.user.email}</p>
            </div>
          </div>
          <FieldRow label="Name" hint="Shown on records you create, in mentions and in invitations you send.">
            <div className="field" data-invalid={err ? true : undefined}>
              <label htmlFor={`${id}-n`} className="field-label sr-only">Name</label>
              <input id={`${id}-n`} className="input" value={name} maxLength={80} autoComplete="name" onChange={e => { setName(e.target.value); if (err) setErr(null) }}
                aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-e` : undefined} />
              {err && <p className="field-error" id={`${id}-e`} role="alert"><AlertCircle size={12} />{err}</p>}
            </div>
          </FieldRow>
          <FieldRow label="Email" hint="Used to sign in and for notifications.">
            <input className="input" value={me.user.email} readOnly aria-label="Email address" />
            <p className="t-small c3 set-mt">Changing your email address isn’t available yet. Contact support if you need it changed.</p>
          </FieldRow>
          <FieldRow label="Avatar" hint="Initials from your name.">
            <p className="t-small c2">Profile photos aren’t supported yet; your initials are used everywhere.</p>
          </FieldRow>
          <div className="set-card-foot">
            <span className="grow" />
            {dirty && !saving && <Button type="button" variant="ghost" size="sm" onClick={() => { setName(me.user.name); setErr(null) }}>Discard</Button>}
            <Button type="submit" variant="primary" size="sm" disabled={!dirty} loading={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      </form>
    </>
  )
}

// ── Notifications & privacy ───────────────────────────────────────────────────
export function NotificationsTab() {
  const q = usePreferences()
  return (
    <>
      <PageTitle title="Notifications & privacy" sub="What Meridian tells you about, where, and what it records about how you use it." />
      {q.isPending ? (
        <div className="set-card set-skel" aria-busy="true" aria-label="Loading preferences">{[0, 1, 2].map(i => <div key={i} className="set-skel-row"><Skeleton w={160} h={11} /><Skeleton w={120} h={18} /></div>)}</div>
      ) : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : <PrefsForm p={q.data} />}
    </>
  )
}

function PrefsForm({ p }: { p: Preferences }) {
  const qc = useQueryClient()
  const { toast } = useApp()
  const [saving, setSaving] = useState<string | null>(null)
  const descId = useId()
  const save = async (key: string, body: Parameters<typeof account.updatePreferences>[0], optimistic: Preferences) => {
    const before = qc.getQueryData<Preferences>(['me', 'preferences'])
    qc.setQueryData(['me', 'preferences'], optimistic)
    setSaving(key)
    try {
      const next = await account.updatePreferences(body)
      qc.setQueryData(['me', 'preferences'], next)
    } catch (e) {
      qc.setQueryData(['me', 'preferences'], before)
      toast(`Couldn’t save: ${errorMessage(e)}`, undefined, 'error')
    } finally { setSaving(null) }
  }
  const types = Object.entries(p.notifications)
  const toggle = (type: string, ch: 'email' | 'inApp', v: boolean) => {
    const cur = p.notifications[type]
    const nextOne = { email: cur.email, inApp: cur.inApp, [ch]: v }
    void save(`${type}.${ch}`, { notifications: { [type]: nextOne } }, { ...p, notifications: { ...p.notifications, [type]: { ...cur, [ch]: v } } })
  }
  return (
    <>
      <section className="set-section" aria-labelledby="pref-n">
        <SectionHead title="Notifications" id="pref-n" sub="Changes save as you make them. Account, security and billing emails are always sent." />
        <div className="set-card set-table">
          <div className="pref-row pref-headrow" aria-hidden>
            <span>Notify me when</span><span>Email</span><span>In-app</span>
          </div>
          {types.map(([type, v]) => (
            <div key={type} className="pref-row" role="group" aria-label={v.label}>
              <span className="pref-label">{v.label}</span>
              <span className="pref-sw"><Switch checked={v.email} onChange={x => toggle(type, 'email', x)} label={`Email: ${v.label}`} hideLabel disabled={saving === `${type}.email`} /><span className="pref-sw-label t-small c2" aria-hidden>Email</span></span>
              <span className="pref-sw"><Switch checked={v.inApp} onChange={x => toggle(type, 'inApp', x)} label={`In-app: ${v.label}`} hideLabel disabled={saving === `${type}.inApp`} /><span className="pref-sw-label t-small c2" aria-hidden>In-app</span></span>
            </div>
          ))}
        </div>
      </section>
      <section className="set-section" aria-labelledby="pref-a">
        <SectionHead title="Privacy" id="pref-a" />
        <div className="set-card">
          <FieldRow label="Product analytics" hint="Helps us see which features are used so we can improve them.">
            <Switch checked={!p.analyticsOptOut} label={p.analyticsOptOut ? 'Off — your activity isn’t recorded' : 'On'} describedBy={descId}
              disabled={saving === 'analytics'} onChange={on => void save('analytics', { analyticsOptOut: !on }, { ...p, analyticsOptOut: !on })} />
            <p className="t-small c2 set-mt" id={descId}>
              First-party only: events are stored in Meridian’s own database, with no third-party scripts or tracking cookies.
              We record product events such as “invited a teammate” or “started checkout” — never stakeholder names, notes or any record content.
              When this is off, nothing about your activity is recorded.
            </p>
          </FieldRow>
        </div>
      </section>
    </>
  )
}

// ── Security ──────────────────────────────────────────────────────────────────
class AuthError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } }
/** Better Auth endpoints (mounted at /api/auth). Errors come back as { code, message }. */
async function authCall<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/auth${path}`, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  } catch { throw new AuthError(0, 'network', 'You appear to be offline. Try again when you’re connected.') }
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  if (!res.ok) {
    const d = data as { code?: string; message?: string } | null
    throw new AuthError(res.status, d?.code ?? `http_${res.status}`, d?.message ?? 'Something went wrong. Please try again.')
  }
  return data as T
}

const AUTH_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: 'Your current password isn’t correct.',
  PASSWORD_TOO_SHORT: 'Use at least 10 characters.',
  PASSWORD_TOO_LONG: 'That password is too long.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'This account doesn’t use a password.',
  SESSION_NOT_FRESH: 'For your security, sign in again to do this.',
}
const authMessage = (e: unknown) => (e instanceof AuthError ? AUTH_MESSAGES[e.code] ?? e.message : errorMessage(e))

interface AuthSession { id: string; token: string; createdAt: string; updatedAt: string; expiresAt: string; ipAddress?: string | null; userAgent?: string | null }

export function SecurityTab() {
  return (
    <>
      <PageTitle title="Security" sub="Your password and where you’re signed in." />
      <PasswordForm />
      <Sessions />
      <section className="set-section" aria-labelledby="sec-later">
        <SectionHead title="Not available yet" id="sec-later" />
        <div className="set-card">
          <FieldRow label={<span className="row gap-2">Two-step verification <Pill tone="neutral">Planned</Pill></span>} hint="A second factor when you sign in.">
            <p className="t-small c2">Not available yet. Use a long, unique password in the meantime.</p>
          </FieldRow>
          <FieldRow label={<span className="row gap-2">Single sign-on (SSO / SAML) <Pill tone="neutral">Planned</Pill></span>} hint="Sign in through your organization’s identity provider.">
            <p className="t-small c2">Planned for the Enterprise plan. It isn’t available on any plan yet.</p>
          </FieldRow>
        </div>
      </section>
    </>
  )
}

function PasswordForm() {
  const { toast } = useApp()
  const qc = useQueryClient()
  const [v, setV] = useState({ current: '', next: '', confirm: '', revoke: true })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useId()
  const set = (k: keyof typeof v, x: string | boolean) => { setV(s => ({ ...s, [k]: x })); if (errs[k]) setErrs(e => ({ ...e, [k]: '' })) }
  const submit = async () => {
    const e: Record<string, string> = {}
    if (!v.current) e.current = 'Enter your current password'
    if (v.next.length < 10) e.next = 'Use at least 10 characters'
    else if (v.next === v.current) e.next = 'Choose a password you haven’t been using'
    if (v.confirm !== v.next) e.confirm = 'Passwords don’t match'
    setErrs(e); setFormErr(null)
    if (Object.values(e).some(Boolean)) return
    setBusy(true)
    try {
      await authCall('/change-password', 'POST', { currentPassword: v.current, newPassword: v.next, revokeOtherSessions: v.revoke })
      setV({ current: '', next: '', confirm: '', revoke: v.revoke })
      toast(v.revoke ? 'Password changed. Other sessions were signed out.' : 'Password changed')
      void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
    } catch (x) {
      if (x instanceof AuthError && x.code === 'INVALID_PASSWORD') setErrs({ current: AUTH_MESSAGES.INVALID_PASSWORD })
      else if (x instanceof AuthError && (x.code === 'PASSWORD_TOO_SHORT' || x.code === 'PASSWORD_TOO_LONG')) setErrs({ next: authMessage(x) })
      else setFormErr(authMessage(x))
    } finally { setBusy(false) }
  }
  const field = (k: 'current' | 'next' | 'confirm', label: string, auto: string, hint?: string) => (
    <div className="field" data-invalid={errs[k] ? true : undefined}>
      <label htmlFor={`${id}-${k}`} className="field-label">{label}</label>
      <input id={`${id}-${k}`} type="password" className="input" value={v[k]} autoComplete={auto} onChange={e => set(k, e.target.value)}
        aria-invalid={errs[k] ? true : undefined} aria-describedby={errs[k] ? `${id}-${k}-e` : hint ? `${id}-${k}-h` : undefined} />
      {errs[k] ? <p className="field-error" id={`${id}-${k}-e`} role="alert"><AlertCircle size={12} />{errs[k]}</p> : hint ? <p className="field-hint" id={`${id}-${k}-h`}>{hint}</p> : null}
    </div>
  )
  return (
    <form className="set-section" onSubmit={e => { e.preventDefault(); void submit() }} noValidate aria-labelledby="sec-pw">
      <SectionHead title="Password" id="sec-pw" />
      <div className="set-card">
        <FieldRow label="Change password" hint="You’ll stay signed in on this device.">
          <div className="sec-pw">
            {field('current', 'Current password', 'current-password')}
            {field('next', 'New password', 'new-password', 'At least 10 characters. A short phrase is easier to remember.')}
            {field('confirm', 'Confirm new password', 'new-password')}
            <label className="sec-check">
              <input type="checkbox" checked={v.revoke} onChange={e => set('revoke', e.target.checked)} />
              <span>Sign out of all other sessions</span>
            </label>
          </div>
        </FieldRow>
        <div className="set-card-foot">
          <div className="grow">{formErr && <div className="form-error" role="alert"><AlertCircle size={14} /><span>{formErr}</span></div>}</div>
          <Button type="submit" variant="primary" size="sm" icon={<KeyRound size={13} />} loading={busy} disabled={!v.current && !v.next}>{busy ? 'Changing…' : 'Change password'}</Button>
        </div>
      </div>
    </form>
  )
}

function describeAgent(ua: string | null | undefined) {
  if (!ua) return { label: 'Unknown device', mobile: false }
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? (/Headless/.test(ua) ? 'Headless Chrome' : 'Chrome') : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Mobile|iPhone|Android/.test(ua) }
}

function Sessions() {
  const { toast } = useApp()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const current = useQuery({ queryKey: ['auth', 'current'], queryFn: () => authCall<{ session: { id: string } } | null>('/get-session'), staleTime: 60_000 })
  const q = useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => authCall<AuthSession[]>('/list-sessions'), retry: false })
  const currentId = current.data?.session.id
  const sessions = [...(q.data ?? [])].sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
  const others = sessions.filter(s => s.id !== currentId).length
  const revoke = async () => {
    setBusy(true)
    try { await authCall('/revoke-other-sessions', 'POST', {}); setConfirm(false); toast('Signed out of other sessions'); void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }) }
    catch (e) { setConfirm(false); toast(authMessage(e), undefined, 'error') }
    finally { setBusy(false) }
  }
  const notFresh = q.error instanceof AuthError && q.error.code === 'SESSION_NOT_FRESH'
  return (
    <section className="set-section" aria-labelledby="sec-sess">
      <SectionHead title="Active sessions" id="sec-sess" sub="Devices and browsers currently signed in to your account."
        aside={q.data && others > 0 ? <Button size="sm" icon={<LogOut size={13} />} onClick={() => setConfirm(true)}>Sign out other sessions</Button> : undefined} />
      {q.isPending ? (
        <div className="set-card set-table" aria-busy="true" aria-label="Loading sessions">{[0, 1].map(i => <div key={i} className="sess-row"><Skeleton w={28} h={28} r={14} /><div className="grow col-gap"><Skeleton w={160} h={11} /><Skeleton w={220} h={10} /></div></div>)}</div>
      ) : notFresh ? (
        <div className="set-card set-quiet t-small c2 row gap-2"><Lock size={13} aria-hidden />For your security, the session list is shown only within a day of signing in. Sign out and back in to review sessions.</div>
      ) : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : (
        <ul className="set-card set-table" aria-label="Sessions">
          {sessions.map(s => {
            const d = describeAgent(s.userAgent)
            const mine = s.id === currentId
            return (
              <li key={s.id} className="sess-row">
                <span className="inv-ico" aria-hidden>{d.mobile ? <Smartphone size={13} /> : <Laptop size={13} />}</span>
                <div className="grow">
                  <p className="row gap-2"><span className="t-strong">{d.label}</span>{mine && <Pill tone="positive">This device</Pill>}</p>
                  <p className="t-small c2">
                    <span title={absTime(s.createdAt)}>Signed in {relTime(s.createdAt).toLowerCase()}</span>
                    {s.ipAddress ? <> · <span className="mono">{s.ipAddress}</span></> : null}
                    {' · '}<span title={absTime(s.expiresAt)}>expires {absTime(s.expiresAt)}</span>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {q.data && others === 0 && <p className="t-small c3 row gap-1"><Check size={12} aria-hidden />This is the only active session.</p>}
      <ConfirmDialog open={confirm} busy={busy} title={`Sign out of ${others} other session${others === 1 ? '' : 's'}?`} confirmLabel="Sign out others"
        body={<>Every other browser and device will need to sign in again. You stay signed in here.</>}
        onCancel={() => !busy && setConfirm(false)} onConfirm={() => void revoke()} />
      <p className="t-small c3 row gap-1"><ShieldCheck size={12} aria-hidden />Sessions expire after 7 days without use.</p>
    </section>
  )
}
