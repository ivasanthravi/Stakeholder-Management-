import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { useApp } from '../shell/context'

/** Shared empty state for records or routes that do not exist (or that the user cannot see). */
export function NotFound({ what, back = '/', backLabel = 'Back to Home' }: { what: string; back?: string; backLabel?: string }) {
  const { openPalette } = useApp()
  return (
    <>
      <header className="page-head"><div className="crumbs"><span className="here">{what} not found</span></div></header>
      <div className="placeholder">
        <div>
          <SearchX size={20} className="c3" />
          <p className="t-heading">This {what.toLowerCase()} doesn’t exist</p>
          <p className="c2">It may have been merged or removed, or the link is wrong. In a real workspace it could also be restricted to other people.</p>
          <div className="row gap-2" style={{ marginTop: 8 }}>
            <Link to={back} className="btn btn-secondary btn-md">{backLabel}</Link>
            <button className="btn btn-ghost btn-md" onClick={() => openPalette()}>Search…</button>
          </div>
        </div>
      </div>
    </>
  )
}
