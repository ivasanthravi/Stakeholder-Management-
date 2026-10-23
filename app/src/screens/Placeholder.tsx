import { useLocation, Link } from 'react-router-dom'
import { Layers } from 'lucide-react'
import { NotFound } from '../components/NotFound'

const SECTIONS = ['initiatives', 'engagements', 'decisions', 'commitments', 'reports']

export function Placeholder() {
  const name = useLocation().pathname.split('/')[1] || 'This section'
  if (!SECTIONS.includes(name)) return <NotFound what="Page" />
  return (
    <>
      <header className="page-head"><div className="crumbs"><span className="here" style={{ textTransform: 'capitalize' }}>{name}</span></div></header>
      <div className="placeholder">
        <div>
          <Layers size={20} className="c3" />
          <p className="t-heading">Not part of this prototype</p>
          <p className="c2">Phase 0 focuses on five screens: Home, Stakeholders, the relationship map, the stakeholder profile, and meeting review.</p>
          <Link to="/" className="btn btn-secondary btn-md" style={{ marginTop: 8 }}>Back to Home</Link>
        </div>
      </div>
    </>
  )
}
