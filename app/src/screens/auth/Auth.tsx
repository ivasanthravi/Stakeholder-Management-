import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { safeNext } from '../../../shared/url'
import { motion } from 'motion/react'
import { AlertCircle, ArrowRight, Inbox, MailCheck } from 'lucide-react'
import { z } from 'zod'
import { authClient, clearRecent, useSession } from '../../session/session'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, errorMessage, request } from '../../api/http'
import { useForm, TextField, FormError } from '../../components/form'
import { Button, Skeleton } from '../../components/ui'
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from '../../../shared/permissions'
import { t } from '../../lib/motion'
import './auth.css'

function AuthLayout({ children, title, subtitle }: { children?: ReactNode; title: string; subtitle?: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-brand" aria-hidden>
        <div className="auth-mark"><svg width="18" height="18" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7 1.4v11.2" stroke="currentColor" strokeWidth="1.3" /></svg>Meridian</div>
        <p className="auth-quote">Every relationship.<br />Every decision.<br />One intelligent workspace.</p>
        <span className="auth-line" />
      </aside>
      <main className="auth-main">
        <motion.div className="auth-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.slow }}>
          <h1 className="t-display">{title}</h1>
          {subtitle && <p className="c2 auth-sub">{subtitle}</p>}
          {children}
        </motion.div>
      </main>
    </div>
  )
}

const signInSchema = z.object({ email: z.string().trim().min(1, 'Required').pipe(z.email('Enter a valid email')), password: z.string().min(1, 'Required') })
const signUpSchema = z.object({ name: z.string().trim().min(1, 'Required').max(80), email: z.string().trim().pipe(z.email('Enter a valid email')), password: z.string().min(10, 'At least 10 characters') })

export function SignIn() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { refresh } = useSession()
  const form = useForm(signInSchema, { email: params.get('email') ?? '', password: '' })
  const [unverified, setUnverified] = useState<string | null>(null)
  const next = safeNext(params.get('next'))

  const submit = () => form.submit(async v => {
    setUnverified(null)
    const { error } = await authClient.signIn.email({ email: v.email, password: v.password })
    if (error) {
      if (error.status === 403) { setUnverified(v.email); throw new ApiError(403, 'unverified', 'Verify your email first.') }
      throw new ApiError(error.status ?? 400, 'auth', error.status === 401 ? 'Email or password is incorrect.' : error.message ?? 'Sign-in failed')
    }
    await refresh()
    nav(next, { replace: true })
  })

  return (
    <AuthLayout title="Sign in" subtitle={params.get('expired') ? <span className="notice">Your session ended. Sign in again to continue where you left off.</span> : params.get('reset') ? 'Password updated. Sign in with your new password.' : 'Welcome back.'}>
      <form className="auth-form" onSubmit={e => { e.preventDefault(); void submit() }} noValidate>
        <TextField form={form} name="email" label="Email" type="email" autoComplete="email" autoFocus />
        <div className="auth-password">
          <TextField form={form} name="password" label="Password" type="password" autoComplete="current-password" />
          {/* Kept outside the field's hint slot: validation replaces the hint with an error on blur, which removed this
              link exactly as keyboard focus moved to it. */}
          <Link to="/forgot-password" className="inline-link auth-forgot">Forgot password?</Link>
        </div>
        {unverified ? <VerifyNotice email={unverified} /> : <FormError form={form} />}
        <Button variant="primary" type="submit" loading={form.submitting} className="auth-submit">Sign in</Button>
      </form>
      <p className="auth-alt c2">New to Meridian? <Link className="inline-link" to={`/sign-up${params.toString() ? `?${params}` : ''}`}>Create an account</Link></p>
    </AuthLayout>
  )
}

function VerifyNotice({ email }: { email: string }) {
  const [sent, setSent] = useState(false)
  return (
    <div className="form-error notice-box" role="alert">
      <MailCheck size={14} />
      <span>Verify your email first. {sent ? 'We’ve sent a new link.' : <button type="button" className="inline-link" onClick={async () => { await authClient.sendVerificationEmail({ email, callbackURL: '/' }); setSent(true) }}>Resend the link</button>}</span>
    </div>
  )
}

export function SignUp() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const invited = (params.get('next') ?? '').startsWith('/invite/')
  const form = useForm(signUpSchema, { name: '', email: params.get('email') ?? '', password: '' })
  const submit = () => form.submit(async v => {
    const { error } = await authClient.signUp.email({ name: v.name, email: v.email, password: v.password, callbackURL: safeNext(params.get('next')) })
    if (error) throw new ApiError(error.status ?? 400, 'auth', error.message ?? 'Could not create the account')
    nav(`/check-email?email=${encodeURIComponent(v.email)}${params.get('next') ? `&next=${encodeURIComponent(safeNext(params.get('next')))}` : ''}`)
  })
  return (
    <AuthLayout title="Create your account" subtitle={invited ? 'Create your account to join your team’s workspace.' : 'Start a free workspace, or join one you’ve been invited to.'}>
      <form className="auth-form" onSubmit={e => { e.preventDefault(); void submit() }} noValidate>
        <TextField form={form} name="name" label="Full name" autoComplete="name" autoFocus />
        <TextField form={form} name="email" label="Work email" type="email" autoComplete="email" hint={invited ? 'Use the address your invitation was sent to.' : undefined} />
        <TextField form={form} name="password" label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." />
        <FormError form={form} />
        <Button variant="primary" type="submit" loading={form.submitting} className="auth-submit">Create account</Button>
      </form>
      <p className="auth-alt c2">Already have an account? <Link className="inline-link" to={`/sign-in${params.toString() ? `?${params}` : ''}`}>Sign in</Link></p>
    </AuthLayout>
  )
}

export function CheckEmail() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const next = safeNext(params.get('next'))
  const [sent, setSent] = useState(false)
  return (
    <AuthLayout title="Check your email" subtitle={<>We sent a verification link to <strong>{email}</strong>. Open it to finish creating your account.</>}>
      <div className="auth-icon"><Inbox size={22} /></div>
      <div className="row gap-2">
        <Button onClick={async () => { await authClient.sendVerificationEmail({ email, callbackURL: next }); setSent(true) }} disabled={sent}>{sent ? 'Link sent again' : 'Resend link'}</Button>
        {import.meta.env.DEV && <Link to="/dev/mail" className="btn btn-ghost btn-md">Open dev mailbox</Link>}
      </div>
      <p className="auth-alt c2"><Link className="inline-link" to="/sign-in">Back to sign in</Link></p>
    </AuthLayout>
  )
}

export function ForgotPassword() {
  const form = useForm(z.object({ email: z.string().trim().pipe(z.email('Enter a valid email')) }), { email: '' })
  const [done, setDone] = useState(false)
  const submit = () => form.submit(async v => {
    await authClient.requestPasswordReset({ email: v.email, redirectTo: '/reset-password' })
    setDone(true) // Same message whether or not the account exists (no account enumeration).
  })
  return (
    <AuthLayout title="Reset your password" subtitle={done ? 'If an account exists for that address, a reset link is on its way. It expires in an hour.' : 'We’ll email you a link to choose a new password.'}>
      {!done ? (
        <form className="auth-form" onSubmit={e => { e.preventDefault(); void submit() }} noValidate>
          <TextField form={form} name="email" label="Email" type="email" autoComplete="email" autoFocus />
          <FormError form={form} />
          <Button variant="primary" type="submit" loading={form.submitting} className="auth-submit">Send reset link</Button>
        </form>
      ) : import.meta.env.DEV ? <Link to="/dev/mail" className="btn btn-secondary btn-md">Open dev mailbox</Link> : null}
      <p className="auth-alt c2"><Link className="inline-link" to="/sign-in">Back to sign in</Link></p>
    </AuthLayout>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const token = params.get('token')
  const form = useForm(z.object({ password: z.string().min(10, 'At least 10 characters'), confirm: z.string() }).refine(v => v.password === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] }), { password: '', confirm: '' })
  const submit = () => form.submit(async v => {
    const { error } = await authClient.resetPassword({ newPassword: v.password, token: token ?? '' })
    if (error) throw new ApiError(error.status ?? 400, 'auth', error.message ?? 'This link is invalid or has expired')
    nav('/sign-in?reset=1', { replace: true })
  })
  if (!token || params.get('error')) return <AuthLayout title="Link expired" subtitle="This reset link is invalid or has expired."><Link to="/forgot-password" className="btn btn-primary btn-md">Request a new link</Link></AuthLayout>
  return (
    <AuthLayout title="Choose a new password" subtitle="You’ll be signed out of other devices.">
      <form className="auth-form" onSubmit={e => { e.preventDefault(); void submit() }} noValidate>
        <TextField form={form} name="password" label="New password" type="password" autoComplete="new-password" autoFocus hint="At least 10 characters." />
        <TextField form={form} name="confirm" label="Confirm password" type="password" autoComplete="new-password" />
        <FormError form={form} />
        <Button variant="primary" type="submit" loading={form.submitting} className="auth-submit">Update password</Button>
      </form>
    </AuthLayout>
  )
}

interface InvitePreview { status: 'pending' | 'accepted' | 'revoked' | 'expired'; workspaceName: string | null; inviter: string | null; role: Role | null; email: string | null; accountExists: boolean | null }

/** A link that can no longer be used says nothing about the workspace behind it. */
function InviteUnavailable({ signedIn }: { signedIn: boolean }) {
  return (
    <AuthLayout title="This invitation link can’t be used any more" subtitle="It may have expired, been withdrawn or already been used. Ask the person who invited you to send a new one.">
      <Link to={signedIn ? '/' : '/sign-in'} className="btn btn-secondary btn-md auth-fit">{signedIn ? 'Go to Meridian' : 'Sign in'}</Link>
    </AuthLayout>
  )
}

export function AcceptInvite() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { me, refresh, switchWorkspace, status } = useSession()
  const [inv, setInv] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<'gone' | 'failed' | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => {
    setLoadError(null)
    request<InvitePreview>(`/api/invitations/${encodeURIComponent(token)}`).then(setInv)
      .catch(e => setLoadError(e instanceof ApiError && e.status === 404 ? 'gone' : 'failed'))
  }
  useEffect(load, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  const here = `/invite/${token}`
  const signedIn = status === 'ready'

  if (loadError === 'gone' || (inv && inv.status !== 'pending')) return <InviteUnavailable signedIn={signedIn} />
  if (loadError) return (
    <AuthLayout title="Couldn’t load this invitation" subtitle="Check your connection and try again.">
      <Button onClick={load} className="auth-fit">Try again</Button>
    </AuthLayout>
  )
  if (!inv || status === 'loading') return (
    <AuthLayout title="Opening your invitation…">
      <div className="invite-card" aria-hidden><Skeleton w={40} h={40} r={10} /><div className="invite-meta"><Skeleton w="60%" h={14} /><Skeleton w="40%" h={12} /></div></div>
    </AuthLayout>
  )

  const email = inv.email ?? ''
  const role = inv.role ?? 'viewer'
  const wrongUser = signedIn && me && me.user.email.toLowerCase() !== email.toLowerCase()
  const qp = `email=${encodeURIComponent(email)}&next=${encodeURIComponent(here)}`

  const accept = async () => {
    setBusy(true); setAcceptError(null)
    try {
      const r = await request<{ workspaceId: string }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} })
      await refresh()
      switchWorkspace(r.workspaceId)
    } catch (e) {
      setBusy(false)
      if (e instanceof ApiError && (e.status === 404 || e.status === 410 || e.status === 409)) { setInv({ ...inv, status: 'expired' }); return }
      if (e instanceof ApiError && e.code === 'seat_limit') { setAcceptError('This workspace has no free seats. Ask an admin to add seats, then open this link again.'); return }
      setAcceptError(errorMessage(e))
    }
  }
  const switchAccount = async () => {
    await authClient.signOut()
    clearRecent()
    qc.clear()
    nav(`/${inv.accountExists ? 'sign-in' : 'sign-up'}?${qp}`, { replace: true })
  }

  return (
    <AuthLayout title={`Join ${inv.workspaceName}`} subtitle={<>{inv.inviter ?? 'A teammate'} invited you to work together in Meridian.</>}>
      <div className="invite-card">
        <span className="invite-ws" aria-hidden>{(inv.workspaceName ?? '?').trim().charAt(0).toUpperCase()}</span>
        <div className="invite-meta">
          <span className="t-strong truncate">{inv.workspaceName}</span>
          <span className="t-small c2">You’ll join as <strong>{ROLE_LABEL[role]}</strong>: {ROLE_DESCRIPTION[role].charAt(0).toLowerCase() + ROLE_DESCRIPTION[role].slice(1)}</span>
          <span className="t-small c3 truncate">Sent to {email}</span>
        </div>
      </div>

      {!signedIn ? (
        inv.accountExists ? (
          <div className="auth-actions">
            <Link to={`/sign-in?${qp}`} className="btn btn-primary btn-md auth-submit">Sign in to accept<ArrowRight size={14} /></Link>
            <p className="auth-alt c2">You already have a Meridian account with {email}.</p>
          </div>
        ) : (
          <div className="auth-actions">
            <Link to={`/sign-up?${qp}`} className="btn btn-primary btn-md auth-submit">Create your account<ArrowRight size={14} /></Link>
            <p className="auth-alt c2">Takes a minute. Already have an account? <Link className="inline-link" to={`/sign-in?${qp}`}>Sign in</Link></p>
          </div>
        )
      ) : wrongUser ? (
        <div className="auth-actions">
          <div className="form-error notice-box" role="alert">
            <AlertCircle size={14} />
            <span>You’re signed in as <strong>{me!.user.email}</strong>, but this invitation is for <strong>{email}</strong>. Sign in with the invited address to accept it.</span>
          </div>
          <Button variant="primary" className="auth-submit" onClick={() => void switchAccount()}>{inv.accountExists ? 'Switch account' : 'Sign out and create an account'}</Button>
        </div>
      ) : (
        <div className="auth-actions">
          {acceptError && <div className="form-error" role="alert"><AlertCircle size={14} /><span>{acceptError}</span></div>}
          <Button variant="primary" loading={busy} icon={!busy && <ArrowRight size={14} />} className="auth-submit auth-icon-end" onClick={() => void accept()} autoFocus>Accept and open {inv.workspaceName}</Button>
          <p className="auth-alt c3">Signed in as {me!.user.email}</p>
        </div>
      )}
    </AuthLayout>
  )
}

/** Development only: shows the emails the app would have sent (verification, reset, invitations). */
export function DevMail() {
  const [mail, setMail] = useState<{ id: string; to: string; subject: string; url: string | null; kind: string; createdAt: string }[] | null>(null)
  useEffect(() => { request<typeof mail>('/api/dev/mail').then(setMail).catch(() => setMail([])) }, [])
  return (
    <AuthLayout title="Dev mailbox" subtitle="Development only. Emails are stored locally and never sent.">
      <ul className="devmail">
        {mail?.map(m => (
          <li key={m.id}><span className="t-caption c3">{m.kind} · {m.to}</span><span className="t-strong">{m.subject}</span>{m.url && <a className="inline-link truncate" href={m.url}>{m.url}</a>}</li>
        ))}
        {mail && !mail.length && <li className="c3">No mail yet.</li>}
      </ul>
    </AuthLayout>
  )
}
