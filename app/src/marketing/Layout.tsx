// Public site chrome: skip link, sticky header with Features menu and mobile sheet, footer.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, BrainCircuit, ChevronDown, LayoutGrid, Menu, Radar, Waypoints, X } from 'lucide-react'
import '@fontsource-variable/newsreader/wght-italic.css'
import './site.css'
import { useSession } from '../session/session'
import { popVariants, fadeVariants } from '../lib/motion'
import { LogoMark } from './parts'

export const FEATURE_LINKS = [
  { to: '/stakeholder-intelligence', label: 'Stakeholder intelligence', desc: 'Signals, briefings and profiles that show their evidence.', icon: Radar },
  { to: '/relationship-mapping', label: 'Relationship mapping', desc: 'A network of recorded relationships, an influence grid and paths.', icon: Waypoints },
  { to: '/ai', label: 'AI', desc: 'Meeting intelligence, briefings and a copilot that cites its sources.', icon: BrainCircuit },
]

function FeaturesMenu() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const loc = useLocation()
  useEffect(() => { setOpen(false) }, [loc.pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const hoverable = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const enter = () => { window.clearTimeout(closeTimer.current); if (hoverable()) setOpen(true) }
  const leave = () => { if (hoverable()) closeTimer.current = window.setTimeout(() => setOpen(false), 140) }
  const items = () => [...(wrap.current?.querySelectorAll<HTMLAnchorElement>('[data-dd-item]') ?? [])]
  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = items(); const i = list.indexOf(document.activeElement as HTMLAnchorElement)
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
  }
  const active = ['/features', ...FEATURE_LINKS.map(f => f.to)].includes(loc.pathname)
  return (
    <div className="mk-dd" ref={wrap} onMouseEnter={enter} onMouseLeave={leave}>
      <button
        ref={btn} className="mk-nav-link" aria-expanded={open} aria-controls={id}
        aria-current={active ? 'page' : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); requestAnimationFrame(() => items()[0]?.focus()) } }}
      >
        Features <ChevronDown size={14} className="chev" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div id={id} className="mk-dd-panel" variants={popVariants} initial="initial" animate="animate" exit="exit" onKeyDown={onPanelKey}>
            {FEATURE_LINKS.map(f => (
              <Link key={f.to} to={f.to} className="mk-dd-item" data-dd-item>
                <span className="ic"><f.icon size={18} aria-hidden /></span>
                <span><b>{f.label}</b><span>{f.desc}</span></span>
              </Link>
            ))}
            <div className="mk-dd-foot">
              <Link to="/features" className="mk-link" data-dd-item><LayoutGrid size={15} aria-hidden /> All features</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MobileMenu({ open, onClose, signedIn }: { open: boolean; onClose: () => void; signedIn: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('a')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); document.querySelector<HTMLElement>('.mk-menu-btn')?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div id="mk-mobile-menu" ref={ref} className="mk-mobile" variants={fadeVariants} initial="initial" animate="animate" exit="exit">
          <nav aria-label="Mobile">
            <Link className="mk-m-link" to="/product">Product <ArrowRight size={16} aria-hidden /></Link>
            <Link className="mk-m-link" to="/features">Features <ArrowRight size={16} aria-hidden /></Link>
            {FEATURE_LINKS.map(f => <Link key={f.to} className="mk-m-link mk-m-sub" to={f.to}>{f.label}</Link>)}
            <Link className="mk-m-link" to="/pricing">Pricing <ArrowRight size={16} aria-hidden /></Link>
            <Link className="mk-m-link" to="/security">Security <ArrowRight size={16} aria-hidden /></Link>
            <Link className="mk-m-link" to="/contact">Contact <ArrowRight size={16} aria-hidden /></Link>
          </nav>
          <div className="mk-ctas">
            {signedIn
              ? <Link to="/" className="mk-btn mk-btn-primary">Open workspace</Link>
              : <>
                <Link to="/sign-up" className="mk-btn mk-btn-primary">Start free trial</Link>
                <Link to="/sign-in" className="mk-btn mk-btn-secondary">Sign in</Link>
              </>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  const { status } = useSession()
  const signedIn = status === 'ready'
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => { setMenu(false) }, [loc.pathname])
  const nav = (to: string, label: string) => (
    <NavLink to={to} className="mk-nav-link">{label}</NavLink>
  )
  return (
    <>
    <header className="mk-header" data-scrolled={scrolled || menu || undefined}>
      <div className="mk-wrap mk-header-in">
        <Link to="/" className="mk-logo" aria-label="Meridian home"><LogoMark size={20} />Meridian</Link>
        <nav className="mk-nav" aria-label="Main">
          {nav('/product', 'Product')}
          <FeaturesMenu />
          {nav('/pricing', 'Pricing')}
          {nav('/security', 'Security')}
          {nav('/contact', 'Contact')}
        </nav>
        <div className="mk-header-actions">
          {signedIn
            ? <Link to="/" className="mk-btn mk-btn-primary mk-btn-sm mk-hide-sm">Open workspace</Link>
            : <>
              <Link to="/sign-in" className="mk-btn mk-btn-ghost mk-btn-sm mk-hide-sm">Sign in</Link>
              <Link to="/sign-up" className="mk-btn mk-btn-primary mk-btn-sm mk-hide-sm">Start free trial</Link>
            </>}
          <button
            className="mk-menu-btn" aria-expanded={menu} aria-controls="mk-mobile-menu"
            aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu(m => !m)}
          >{menu ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}</button>
        </div>
      </div>
    </header>
    {/* Outside the header: its backdrop-filter would otherwise become the containing block for this fixed sheet. */}
    <MobileMenu open={menu} onClose={() => setMenu(false)} signedIn={signedIn} />
    </>
  )
}

function Footer() {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap">
        <div className="mk-footer-top">
          <div className="mk-footer-brand">
            <Link to="/" className="mk-logo"><LogoMark size={20} />Meridian</Link>
            <p>The stakeholder intelligence workspace for the people, promises and decisions behind your work.</p>
          </div>
          <div>
            <h2>Product</h2>
            <ul>
              <li><Link to="/product">Overview</Link></li>
              <li><Link to="/features">All features</Link></li>
              {FEATURE_LINKS.map(f => <li key={f.to}><Link to={f.to}>{f.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li><Link to="/pricing">Pricing</Link></li>
              <li><Link to="/security">Security</Link></li>
              <li><Link to="/contact">Contact sales</Link></li>
              <li><Link to="/contact?topic=support">Support</Link></li>
            </ul>
          </div>
          <div>
            <h2>Account</h2>
            <ul>
              <li><Link to="/sign-up">Start free trial</Link></li>
              <li><Link to="/sign-in">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="mk-footer-bottom">
          <span>© {new Date().getFullYear()} Meridian</span>
          <span>Screenshots show a fictional sample workspace. Any people shown are fictional.</span>
        </div>
      </div>
    </footer>
  )
}

/** Wraps every public page. Switches the document to normal scrolling while mounted. */
export function SiteLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('mk-doc')
    return () => html.classList.remove('mk-doc')
  }, [])
  useEffect(() => {
    if (hash) { document.getElementById(hash.slice(1))?.scrollIntoView(); return }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return (
    <div className="mk">
      <a href="#main" className="mk-skip">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
    </div>
  )
}
