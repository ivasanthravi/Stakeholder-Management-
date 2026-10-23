// Contact / sales form. Posts to /api/contact via account.contact(); handles field errors (422), rate limits (429)
// and an unconfigured mail destination (503). A hidden honeypot field ("website") must stay empty.
import { useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ArrowRight, CircleCheck, Clock, MessageSquareText, ShieldCheck, Sparkles } from 'lucide-react'
import { account } from '../api/commercial'
import { ApiError, NetworkError } from '../api/http'
import { t } from '../lib/motion'
import { SiteLayout } from './Layout'
import { Eyebrow, PageHero, Reveal, usePageMeta } from './parts'

const TOPICS = [
  { id: 'sales', label: 'Sales' },
  { id: 'support', label: 'Support' },
  { id: 'security', label: 'Security' },
  { id: 'other', label: 'Something else' },
] as const
type Topic = typeof TOPICS[number]['id']
const SIZES = ['1–5', '6–20', '21–50', '51–100', '100+']

type Fields = { name: string; email: string; company: string; teamSize: string; topic: Topic; message: string; website: string }
type Errors = Partial<Record<keyof Fields, string>>
const LABELS: Record<string, string> = { name: 'Name', email: 'Work email', company: 'Company', teamSize: 'Team size', topic: 'Topic', message: 'Message' }

function validate(f: Fields): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = 'Enter your name.'
  else if (f.name.trim().length > 80) e.name = 'Use 80 characters or fewer.'
  if (!f.email.trim()) e.email = 'Enter your email address.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address, like name@company.com.'
  if (f.company.length > 120) e.company = 'Use 120 characters or fewer.'
  if (f.message.trim().length < 10) e.message = 'Tell us a little more (at least 10 characters).'
  else if (f.message.length > 4000) e.message = 'Use 4,000 characters or fewer.'
  return e
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; tone: 'err' | 'warn'; title: string; body: string }

function ContactForm() {
  const [params] = useSearchParams()
  const initialTopic = (TOPICS.find(x => x.id === params.get('topic'))?.id ?? 'sales') as Topic
  const [f, setF] = useState<Fields>({ name: '', email: '', company: '', teamSize: '', topic: initialTopic, message: '', website: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, boolean>>>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const summary = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => {
    setF(prev => ({ ...prev, [k]: v }))
    // Clear an error as soon as the field becomes valid; never show new errors while typing.
    if (errors[k]) setErrors(prev => { const n = { ...prev }; if (!validate({ ...f, [k]: v })[k]) delete n[k]; return n })
  }
  const blur = (k: keyof Fields) => {
    setTouched(p => ({ ...p, [k]: true }))
    const e = validate(f)[k]
    setErrors(prev => { const n = { ...prev }; if (e && (f[k] as string).length) n[k] = e; else if (!e) delete n[k]; return n })
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate(f)
    setErrors(e)
    setTouched({ name: true, email: true, message: true, company: true })
    if (Object.keys(e).length) {
      setStatus({ kind: 'idle' })
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    setStatus({ kind: 'sending' })
    try {
      await account.contact({
        name: f.name.trim(), email: f.email.trim(), company: f.company.trim() || undefined, teamSize: f.teamSize || undefined,
        topic: f.topic, message: f.message.trim(), website: f.website,
      })
      setStatus({ kind: 'sent', email: f.email.trim() })
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Object.keys(err.fields).length) {
        const fe: Errors = {}
        for (const [k, v] of Object.entries(err.fields)) if (k in LABELS) fe[k as keyof Fields] = v === 'Required' ? `${LABELS[k]} is required.` : v
        setErrors(fe)
        setStatus({ kind: 'idle' })
        requestAnimationFrame(() => summary.current?.focus())
      } else if (err instanceof ApiError && err.status === 429) {
        setStatus({ kind: 'error', tone: 'warn', title: 'Too many messages from this connection.', body: 'Please wait a while and try again. Your message is still in the form.' })
      } else if (err instanceof ApiError && err.status === 503) {
        setStatus({ kind: 'error', tone: 'warn', title: 'The contact form isn’t connected yet.', body: 'This deployment hasn’t been set up to deliver messages, so nothing was sent. Your message is still in the form if you want to copy it. You can also start a free trial without talking to us.' })
      } else if (err instanceof NetworkError) {
        setStatus({ kind: 'error', tone: 'err', title: 'You appear to be offline.', body: 'Nothing was sent. Check your connection and try again.' })
      } else {
        setStatus({ kind: 'error', tone: 'err', title: 'Something went wrong on our side.', body: 'Nothing was sent. Please try again in a moment.' })
      }
    }
  }

  const errList = Object.entries(errors).filter(([, v]) => v) as [keyof Fields, string][]
  const show = (k: keyof Fields) => (touched[k] || errors[k]) && errors[k]
  const fieldProps = (k: keyof Fields) => ({
    id: `c-${k}`, name: k, 'aria-invalid': show(k) ? true : undefined,
    'aria-describedby': show(k) ? `c-${k}-err` : undefined,
    onBlur: () => blur(k),
  })
  const Err = ({ k }: { k: keyof Fields }) => show(k) ? <span className="err" id={`c-${k}-err`}><AlertCircle size={14} aria-hidden />{errors[k]}</span> : null

  if (status.kind === 'sent') {
    return (
      <motion.div className="mk-success" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: t.slow }}>
        <span className="ic"><CircleCheck size={22} aria-hidden /></span>
        <h2 className="mk-h3">Thanks, your message is on its way.</h2>
        <p className="mk-body">We’ve sent a confirmation to <b style={{ color: 'var(--text-1)', fontWeight: 560 }}>{status.email}</b>. We’ll reply to that address.</p>
        <div className="mk-ctas" style={{ marginTop: 8 }}>
          <Link to="/sign-up" className="mk-btn mk-btn-primary">Start free trial</Link>
          <Link to="/product" className="mk-btn mk-btn-secondary">Explore the product</Link>
        </div>
      </motion.div>
    )
  }

  return (
    <form ref={form} className="mk-form" onSubmit={submit} noValidate aria-labelledby="contact-form-title">
      <h2 id="contact-form-title" className="mk-h3">Send us a message</h2>
      {errList.length > 0 && (
        <div ref={summary} tabIndex={-1} className="mk-alert err" role="alert">
          <AlertCircle size={18} aria-hidden />
          <div>
            <b>{errList.length === 1 ? 'One thing to fix before sending:' : `${errList.length} things to fix before sending:`}</b>
            <ul>{errList.map(([k, v]) => <li key={k}><a href={`#c-${k}`} onClick={e => { e.preventDefault(); document.getElementById(`c-${k}`)?.focus() }}>{LABELS[k]}: {v}</a></li>)}</ul>
          </div>
        </div>
      )}
      <AnimatePresence>
        {status.kind === 'error' && (
          <motion.div className={`mk-alert ${status.tone}`} role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0 }}>
            <AlertCircle size={18} aria-hidden />
            <div><b>{status.title}</b> {status.body}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mk-form-row">
        <div className="mk-field">
          <label htmlFor="c-name">Name</label>
          <input {...fieldProps('name')} autoComplete="name" value={f.name} onChange={e => set('name', e.target.value)} required maxLength={80} />
          <Err k="name" />
        </div>
        <div className="mk-field">
          <label htmlFor="c-email">Work email</label>
          <input {...fieldProps('email')} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={e => set('email', e.target.value)} required />
          <Err k="email" />
        </div>
      </div>
      <div className="mk-form-row">
        <div className="mk-field">
          <label htmlFor="c-company">Company <span className="opt">(optional)</span></label>
          <input {...fieldProps('company')} autoComplete="organization" value={f.company} onChange={e => set('company', e.target.value)} maxLength={120} />
          <Err k="company" />
        </div>
        <div className="mk-field">
          <label htmlFor="c-teamSize">Team size <span className="opt">(optional)</span></label>
          <select {...fieldProps('teamSize')} value={f.teamSize} onChange={e => set('teamSize', e.target.value)}>
            <option value="">Choose…</option>
            {SIZES.map(s => <option key={s} value={s}>{s} people</option>)}
          </select>
        </div>
      </div>
      <fieldset className="mk-field">
        <legend>What’s it about?</legend>
        <div className="mk-topics" style={{ marginTop: 7 }}>
          {TOPICS.map(x => (
            <label key={x.id} className="mk-topic">
              <input type="radio" name="topic" value={x.id} checked={f.topic === x.id} onChange={() => set('topic', x.id)} />
              <span>{x.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mk-field">
        <label htmlFor="c-message">Message</label>
        <textarea {...fieldProps('message')} value={f.message} onChange={e => set('message', e.target.value)} required maxLength={4000}
          aria-describedby={show('message') ? 'c-message-err' : 'c-message-help'} />
        {show('message') ? <Err k="message" /> : <span className="help" id="c-message-help">What are you working on, and what would you like to know?</span>}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots that fill it are rejected by the server. */}
      <div className="mk-hp" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF(p => ({ ...p, website: e.target.value }))} />
      </div>
      <div className="mk-form-foot">
        <p className="mk-small" style={{ fontSize: 13 }}>We use your details only to reply to this message.</p>
        <button type="submit" className="mk-btn mk-btn-primary" disabled={status.kind === 'sending'} aria-busy={status.kind === 'sending' || undefined}>
          {status.kind === 'sending' ? 'Sending…' : <>Send message <ArrowRight size={16} className="mk-arrow" aria-hidden /></>}
        </button>
      </div>
    </form>
  )
}

export function ContactPage() {
  usePageMeta('Contact — Meridian', 'Talk to the Meridian team about plans, a trial for your team, security questions or support.')
  return (
    <SiteLayout>
      <PageHero
        eyebrow="Contact"
        title={<>Talk to <em>a person.</em></>}
        lede="Questions about plans, a rollout across several teams, or a security review? Send us a note and someone from the team will reply by email."
      />
      <section className="mk-section" style={{ paddingTop: 0 }} aria-label="Contact form">
        <div className="mk-wrap mk-contact">
          <Reveal className="mk-contact-side">
            <Eyebrow plain>What we can help with</Eyebrow>
            <dl>
              <div><dt><MessageSquareText size={18} aria-hidden />Plans and quotes</dt><dd>Public prices aren’t published yet. Tell us about your team and we’ll quote for Starter, Professional or Enterprise.</dd></div>
              <div><dt><ShieldCheck size={18} aria-hidden />Security questions</dt><dd>We’ll describe our controls plainly, including what isn’t available yet. Start with the <Link to="/security" className="mk-link" style={{ fontSize: 'inherit' }}>security overview</Link>.</dd></div>
              <div><dt><Sparkles size={18} aria-hidden />Trying it first</dt><dd>You don’t need to talk to us to start: a 14-day trial of Professional needs no card. <Link to="/sign-up" className="mk-link" style={{ fontSize: 'inherit' }}>Start free trial</Link></dd></div>
              <div><dt><Clock size={18} aria-hidden />Already a customer?</dt><dd>Choose “Support” and include your workspace name so we can find it quickly.</dd></div>
            </dl>
          </Reveal>
          <Reveal delay={0.06}><ContactForm /></Reveal>
        </div>
      </section>
    </SiteLayout>
  )
}
