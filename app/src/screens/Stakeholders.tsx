import { AnimatePresence, motion, LayoutGroup } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Network, Table2 } from 'lucide-react'
import { useLookups } from '../api/hooks'
import { useHotkeys } from '../lib/hotkeys'
import { t } from '../lib/motion'
import { Directory } from './directory/Directory'
import { Skeleton } from '../components/ui'
import './stakeholders.css'

const loadUniverse = () => import('./universe/Universe')
const Universe = lazy(loadUniverse)

export function Stakeholders() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'map' ? 'map' : 'table'
  const lookups = useLookups()
  const initiative = lookups.data?.initiatives.find(i => i.id === params.get('initiative'))

  // Warm the map chunk while idle so switching views doesn't wait on download + parse.
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200))
    ric(() => { loadUniverse() })
  }, [])

  const setView = (v: 'table' | 'map') => {
    const next = new URLSearchParams(params)
    if (v === 'map') next.set('view', 'map'); else next.delete('view')
    setParams(next, { replace: true })
  }
  useHotkeys({ 'v t': () => setView('table'), 'v m': () => setView('map') }, [params])

  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          <span className={initiative ? '' : 'here'}>Stakeholders</span>
          {initiative && <><span className="sep">/</span><span className="here">{initiative.name}</span></>}
        </div>
        <span className="grow" />
        <ViewSwitch view={view} onChange={setView} />
      </header>
      <div className="sh-body">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={view}
            className="sh-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { ...t.slow, delay: 0.04 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {view === 'table' ? <Directory /> : (
              <Suspense fallback={<div className="sh-loading"><Skeleton w={180} h={10} /><Skeleton w={120} h={10} /></div>}>
                <Universe />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}

function ViewSwitch({ view, onChange }: { view: 'table' | 'map'; onChange: (v: 'table' | 'map') => void }) {
  const opts = [
    { v: 'table' as const, label: 'Table', icon: Table2, key: 'V T' },
    { v: 'map' as const, label: 'Map', icon: Network, key: 'V M' },
  ]
  return (
    <LayoutGroup id="viewswitch">
      <div className="seg" role="radiogroup" aria-label="View">
        {opts.map(o => (
          <button key={o.v} role="radio" aria-checked={view === o.v} className="seg-btn" onClick={() => onChange(o.v)} title={`${o.label} view (${o.key})`}>
            {view === o.v && <motion.span layoutId="seg-on" className="seg-on" transition={t.indicator} />}
            <o.icon size={14} /><span>{o.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}
