import { AnimatePresence, motion, LayoutGroup } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2, Check, ChevronsUpDown, CreditCard, UserRound, Gavel, Handshake, Home, LogOut, MessageCircleQuestionMark, MessagesSquare, Plus, Search, Settings, Target, Users, HelpCircle, WifiOff,
} from 'lucide-react'
import { useApp } from './context'
import { useHotkeys, MOD } from '../lib/hotkeys'
import { t } from '../lib/motion'
import { useLookups } from '../api/hooks'
import { useSession } from '../session/session'
import { ROLE_LABEL } from '../../shared/permissions'
import { CommandPalette } from './CommandPalette'
import { Copilot } from './Copilot'
import { Toasts } from './Toasts'
import { Avatar, Kbd } from '../components/ui'
import { Menu } from '../components/Menu'
import { CreateDrawers } from '../forms/RecordForms'
import { useVocabulary } from '../lib/vocabulary'
import { UpgradePromptHost } from '../components/UpgradePrompt'
import { InboxButton } from './Inbox'
import { AccessBanner } from './AccessBanner'
import './shell.css'

const NAV = [
  { to: '/', label: 'Home', icon: Home, key: 'h', end: true },
  { to: '/stakeholders', label: 'Stakeholders', icon: Users, key: 's' },
  { to: '/organizations', label: 'Organizations', icon: Building2, key: 'o' },
  { to: '/initiatives', label: 'Initiatives', icon: Target, key: 'i' },
  { to: '/engagements', label: 'Engagements', icon: MessagesSquare, key: 'e' },
  { to: '/decisions', label: 'Decisions', icon: Gavel, key: 'd' },
  { to: '/commitments', label: 'Commitments', icon: Handshake, key: 'c' },
]

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export function Shell() {
  const nav = useNavigate()
  const loc = useLocation()
  const { openPalette, liveMessage, openCreate } = useApp()
  const { me, workspace, switchWorkspace, signOut, can } = useSession()
  const lookups = useLookups()
  const online = useOnline()
  const wsBtn = useRef<HTMLButtonElement>(null)
  const userBtn = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<'ws' | 'user' | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const toggleAsk = useCallback(() => setAskOpen(o => !o), [])
  const vocab = useVocabulary()
  // Nav labels follow the workspace's vocabulary; routes stay the same.
  const navLabel = (to: string, fallback: string) => (to === '/stakeholders' ? vocab.stakeholders : to === '/organizations' ? vocab.organizations : to === '/initiatives' ? vocab.initiatives : fallback)
  // Banners (offline, access) sit above the page; the page is offset by their measured height.
  const bannersRef = useRef<HTMLDivElement>(null)
  // The first screen after load appears without a fade; later section changes fade in.
  const firstPage = useRef(true)
  useEffect(() => { firstPage.current = false }, [])
  const [bannerH, setBannerH] = useState(0)
  useLayoutEffect(() => {
    const el = bannersRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBannerH(el.offsetHeight))
    ro.observe(el)
    setBannerH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  useHotkeys({
    'mod+k': () => openPalette(),
    'mod+j': () => toggleAsk(),
    '/': () => openPalette(),
    ...Object.fromEntries(NAV.map(n => [`g ${n.key}`, () => { nav(n.to) }])),
    'g m': () => { nav('/stakeholders?view=map') },
    'g ,': () => { nav('/settings') },
    'c p': () => { if (can('stakeholder.create')) openCreate('stakeholder') },
    'c o': () => { if (can('organization.create')) openCreate('organization') },
    'c e': () => { if (can('engagement.create')) openCreate('engagement') },
    'c m': () => { if (can('commitment.create')) openCreate('commitment') },
    'c d': () => { if (can('decision.create')) openCreate('decision') },
    'c i': () => { if (can('initiative.create')) openCreate('initiative') },
  }, [nav, openPalette, can, openCreate, toggleAsk])

  const section = '/' + (loc.pathname.split('/')[1] ?? '')
  const initiatives = lookups.data?.initiatives ?? []
  const currentInit = loc.pathname === '/stakeholders' ? new URLSearchParams(loc.search).get('initiative') : null

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Primary">
        <button ref={wsBtn} className="ws-switch" aria-haspopup="listbox" aria-label={`Workspace: ${workspace?.name}. Switch workspace`} onClick={() => setMenu('ws')}>
          <span className="ws-mark" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M7 1.4v11.2" stroke="currentColor" strokeWidth="1.4"/></svg>
          </span>
          <span className="truncate ws-name">{workspace?.name}</span>
          <ChevronsUpDown size={14} className="c3" />
        </button>

        <div className="side-actions">
          <button className="side-search" onClick={() => openPalette()}>
            <Search size={14} />
            <span className="grow truncate">Search…</span>
            <Kbd>{MOD}K</Kbd>
          </button>
          <button className="side-bell" data-copilot-opener aria-label={`Ask copilot (${MOD} J)`} title={`Ask copilot · ${MOD} J`} aria-expanded={askOpen} onClick={toggleAsk}><MessageCircleQuestionMark size={15} /></button>
          <InboxButton />
        </div>

        <LayoutGroup id="nav">
          <nav className="nav">
            {NAV.map(n => {
              const active = n.end ? loc.pathname === '/' : loc.pathname.startsWith(n.to)
              return (
                <NavLink key={n.to} to={n.to} end={n.end} className="nav-item" aria-current={active ? 'page' : undefined}>
                  {active && <motion.span layoutId="nav-active" className="nav-active" transition={t.indicator} />}
                  <n.icon size={16} strokeWidth={1.75} />
                  <span className="grow truncate">{navLabel(n.to, n.label)}</span>
                  <span className="nav-key" aria-hidden>G {n.key.toUpperCase()}</span>
                </NavLink>
              )
            })}
          </nav>
        </LayoutGroup>

        {initiatives.length > 0 && (
          <div className="side-section">
            <div className="side-label">{vocab.initiatives}</div>
            {initiatives.filter(i => i.status !== 'completed').slice(0, 8).map(i => (
              <Link key={i.id} to={`/stakeholders?view=map&initiative=${i.id}`} className="nav-item nav-sub" aria-current={currentInit === i.id ? 'page' : undefined}>
                <span className="init-code mono">{i.code}</span>
                <span className="truncate grow">{i.name}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="side-foot">
          <NavLink to="/settings" className="nav-item"><Settings size={16} strokeWidth={1.75} /><span className="grow">Settings</span><span className="nav-key" aria-hidden>G ,</span></NavLink>
          <button className="nav-item" onClick={() => openPalette('?')}><HelpCircle size={16} strokeWidth={1.75} /><span>Shortcuts</span><span className="nav-key">?</span></button>
          <button ref={userBtn} className="user-btn" onClick={() => setMenu('user')} aria-haspopup="listbox" aria-label={`Account: ${me?.user.name}`}>
            <Avatar name={me?.user.name ?? '?'} size={22} internal />
            <span className="grow truncate"><span className="t-strong">{me?.user.name}</span><span className="c3 t-small" style={{ display: 'block' }}>{workspace ? ROLE_LABEL[workspace.role] : ''}</span></span>
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="main-banners" ref={bannersRef}>
          <AnimatePresence>
            {!online && (
              <motion.div className="offline" role="status" initial={{ height: 0, opacity: 0 }} animate={{ height: 32, opacity: 1, transition: t.base }} exit={{ height: 0, opacity: 0, transition: t.exit }}>
                <WifiOff size={13} /> You’re offline. You can keep reading; changes will fail until you reconnect.
              </motion.div>
            )}
          </AnimatePresence>
          <AccessBanner />
        </div>
        {/* No exit animation: an exiting container's <Outlet/> already renders the NEW route, so the next screen
            appeared, faded out, then mounted again. The new section replaces the old at once and fades in. */}
        <motion.div
          key={section}
          className="page"
          style={bannerH ? { top: bannerH } : undefined}
          initial={firstPage.current ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: t.fast }}
        >
          <Outlet />
        </motion.div>
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        <NavLink to="/" end className="bn-item"><Home size={18} /><span>Home</span></NavLink>
        <NavLink to="/stakeholders" end className="bn-item"><Users size={18} /><span>People</span></NavLink>
        <button className="bn-item" onClick={() => openPalette()}><Search size={18} /><span>Search</span></button>
        <button className="bn-item" aria-expanded={askOpen} onClick={toggleAsk}><MessageCircleQuestionMark size={18} /><span>Ask</span></button>
        <NavLink to="/commitments" className="bn-item"><Handshake size={18} /><span>Commitments</span></NavLink>
        <InboxButton variant="bottom" />
      </nav>

      <Menu anchor={wsBtn.current} open={menu === 'ws'} onClose={() => setMenu(null)} label="Workspaces"
        options={[
          ...(me?.workspaces ?? []).map(w => ({ value: w.id, label: w.name, hint: ROLE_LABEL[w.role], icon: w.id === workspace?.id ? <Check size={13} className="menu-tick" /> : <span style={{ width: 13 }} /> })),
          { value: '__new', label: 'Create workspace…', icon: <Plus size={13} /> },
        ]}
        selected={workspace ? [workspace.id] : []}
        onSelect={v => { if (v === '__new') nav('/onboarding'); else if (v !== workspace?.id) switchWorkspace(v) }} />
      <Menu anchor={userBtn.current} open={menu === 'user'} onClose={() => setMenu(null)} label="Account"
        options={[
          { value: 'profile', label: 'Your profile', icon: <UserRound size={13} /> },
          { value: 'settings', label: 'Workspace settings', icon: <Settings size={13} /> },
          ...(can('billing.read') ? [{ value: 'billing', label: 'Plan & billing', icon: <CreditCard size={13} /> }] : []),
          { value: 'signout', label: 'Sign out', icon: <LogOut size={13} />, hint: me?.user.email },
        ]}
        onSelect={v => { if (v === 'settings') nav('/settings'); else if (v === 'profile') nav('/settings/profile'); else if (v === 'billing') nav('/settings/billing'); else void signOut() }} />

      <CommandPalette />
      <Copilot open={askOpen} onOpenChange={setAskOpen} />
      <CreateDrawers />
      <Toasts />
      <UpgradePromptHost />
      <div className="sr-only" role="status" aria-live="polite">{liveMessage}</div>
    </div>
  )
}
