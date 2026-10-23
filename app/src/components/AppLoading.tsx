import { Skeleton } from './ui'

/** First-paint placeholder shaped like the app shell, so the layout doesn't jump when the session resolves. */
export function AppLoading() {
  return (
    <div className="app" aria-busy="true" aria-label="Loading Meridian">
      <aside className="sidebar">
        <div style={{ padding: '6px 8px 14px' }}><Skeleton w={150} h={14} /></div>
        {Array.from({ length: 7 }, (_, i) => <div key={i} style={{ padding: '8px' }}><Skeleton w={100 + (i % 3) * 18} h={10} /></div>)}
      </aside>
      <main className="main"><div className="page"><header className="page-head"><Skeleton w={120} h={12} /></header></div></main>
    </div>
  )
}
