import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, CheckCircle2, Inbox, MailCheck, Users } from 'lucide-react'
import { z } from 'zod'
import { authClient, useSession } from '../../session/session'
import { ApiError, request } from '../../api/http'
import { useForm, TextField, FormError } from '../../components/form'
import { Button } from '../../components/ui'
import { ROLE_LABEL } from '../../../shared/permissions'
import { workspaceCreateSchema } from '../../../shared/schemas'
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
  const next = params.get('next') || '/'

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
        <TextField form={form} name="password" label="Password" type="password" autoComplete="current-password"
          hint={<Link to="/forgot-password" className="inline-link">Forgot password?</Link>} />
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
  const form = useForm(signUpSchema, { name: '', email: params.get('email') ?? '', password: '' })
  const submit = () => form.submit(async v => {
    const { error } = await authClient.signUp.email({ name: v.name, email: v.email, password: v.password, callbackURL: params.get('next') || '/' })
    if (error) throw new ApiError(error.status ?? 400, 'auth', error.message ?? 'Could not create the account')
    nav(`/check-email?email=${encodeURIComponent(v.email)}`)
  })
  return (
    <AuthLayout title="Create your account" subtitle="Start a workspace, or join one you’ve been invited to.">
      <form className="auth-form" onSubmit={e => { e.preventDefault(); void submit() }} noValidate>
        <TextField form={form} name="name" label="Full name" autoComplete="name" autoFocus />
        <TextField form={form} name="email" label="Work email" type="email" autoComplete="email" />
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
  const [sent, setSent] = useState(false)
  return (
    <AuthLayout title="Check your email" subtitle={<>We sent a verification link to <strong>{email}</strong>. Open it to finish creating your account.</>}>
      <div className="auth-icon"><Inbox size={22} /></div>
      <div className="row gap-2">
        <Button onClick={async () => { await authClient.sendVerificationEmail({ email, callbackURL: '/' }); setSent(true) }} disabled={sent}>{sent ? 'Link sent again' : 'Resend link'}</Button>
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

interface InvitePreview { workspaceName: string; inviter: string | null; role: string; email: string; status: 'pending' | 'accepted' | 'revoked' | 'expired' }
export function AcceptInvite() {
  const { token = '' } = useParams()
  const { me, refresh, switchWorkspace, status } = useSession()
  const [inv, setInv] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { request<InvitePreview>(`/api/invitations/${token}`).then(setInv).catch(e => setError((e as Error).message)) }, [token])
  const here = `/invite/${token}`
  if (error || inv?.status === 'revoked') return <AuthLayout title="Invitation not found" subtitle="This invitation was withdrawn or the link is wrong. Ask the person who invited you for a new one." />
  if (!inv) return <AuthLayout title="Loading invitation…" />
  if (inv.status === 'expired') return <AuthLayout title="Invitation expired" subtitle={`Ask someone at ${inv.workspaceName} to invite you again.`} />
  if (inv.status === 'accepted') return <AuthLayout title="Already accepted" subtitle="This invitation has been used."><Link to="/" className="btn btn-primary btn-md">Go to Meridian</Link></AuthLayout>
  const wrongUser = me && me.user.email.toLowerCase() !== inv.email.toLowerCase()
  return (
    <AuthLayout title={`Join ${inv.workspaceName}`} subtitle={<>{inv.inviter ?? 'A teammate'} invited <strong>{inv.email}</strong> as {ROLE_LABEL[inv.role as keyof typeof ROLE_LABEL] ?? inv.role}.</>}>
      <div className="auth-icon"><Users size={22} /></div>
      {status !== 'ready' ? (
        <div className="row gap-2">
          <Link to={`/sign-up?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(here)}`} className="btn btn-primary btn-md">Create account</Link>
          <Link to={`/sign-in?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(here)}`} className="btn btn-secondary btn-md">Sign in</Link>
        </div>
      ) : wrongUser ? (
        <div className="form-error" role="alert">You’re signed in as {me!.user.email}. Sign out and sign in as {inv.email} to accept.</div>
      ) : (
        <Button variant="primary" loading={busy} icon={<ArrowRight size={14} />} onClick={async () => {
          setBusy(true)
          try {
            const r = await request<{ workspaceId: string }>(`/api/invitations/${token}/accept`, { method: 'POST', body: {} })
            await refresh(); switchWorkspace(r.workspaceId)
          } catch (e) { setError((e as Error).message); setBusy(false) }
        }}>Accept and open workspace</Button>
      )}
    </AuthLayout>
  )
}

export function Onboarding() {
  const { me, refresh, switchWorkspace, signOut } = useSession()
  const form = useForm(workspaceCreateSchema, { name: '' })
  const submit = () => form.submit(async v => {
    const w = await request<{ id: string }>('/api/workspaces', { method: 'POST', body: v })
    await refresh(); switchWorkspace(w.id)
  })
  return (
    <AuthLayout title="Create your workspace" subtitle="A workspace holds your organization’s stakeholders, initiatives and decisions. You can invite your team next.">
      <form className="auth-form" onSubmit={e => { e.preventDefault(); void submit() }} noValidate>
        <TextField form={form} name="name" label="Workspace name" placeholder="e.g. Westshire Infrastructure" autoFocus />
        <FormError form={form} />
        <Button variant="primary" type="submit" loading={form.submitting} className="auth-submit">Create workspace</Button>
      </form>
      {!!me?.invitations.length && (
        <div className="auth-invites">
          <p className="t-caption c3">Pending invitations</p>
          {me.invitations.map(i => <div key={i.id} className="auth-invite"><CheckCircle2 size={14} className="c3" />{i.workspaceName} · {ROLE_LABEL[i.role]} <span className="c3">— open the link in your email to join</span></div>)}
        </div>
      )}
      <p className="auth-alt c2">Signed in as {me?.user.email}. <button className="inline-link" onClick={() => void signOut()}>Sign out</button></p>
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
