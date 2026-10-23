import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createAuthClient } from 'better-auth/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError, onUnauthorized, setWorkspaceId } from '../api/http'
import { useMe } from '../api/hooks'
import type { Me } from '../api/types'
import { can as canDo, type Action, type Role } from '../../shared/permissions'

export const authClient = createAuthClient({ baseURL: typeof window !== 'undefined' ? window.location.origin : undefined })

const KEY = 'meridian.workspace'
const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const write = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* storage unavailable */ } }

interface Session {
  status: 'loading' | 'anonymous' | 'ready'
  me: Me | null
  workspace: Me['workspaces'][number] | null
  role: Role | null
  can: (a: Action) => boolean
  switchWorkspace: (id: string) => void
  refresh: () => Promise<unknown>
  signOut: () => Promise<void>
}

const Ctx = createContext<Session>(null!)
export const useSession = () => useContext(Ctx)
export const useCan = () => useContext(Ctx).can

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const loc = useLocation()
  const me = useMe()
  const [selected, setSelected] = useState<string | null>(read)

  const anonymous = me.error instanceof ApiError && me.error.status === 401
  const data = me.data ?? null
  const workspace = useMemo(() => {
    if (!data?.workspaces.length) return null
    return data.workspaces.find(w => w.id === selected) ?? data.workspaces[0]
  }, [data, selected])

  // The module-level workspace id must be set before any tenant query runs in this render.
  setWorkspaceId(workspace?.id ?? null)

  useEffect(() => onUnauthorized(() => {
    // Only an expired *existing* session redirects; an anonymous visitor on a public page stays put.
    if (!qc.getQueryData(['me'])) return
    qc.removeQueries({ queryKey: ['w'] })
    qc.setQueryData(['me'], undefined)
    void qc.invalidateQueries({ queryKey: ['me'] })
    if (!loc.pathname.startsWith('/sign-in')) nav(`/sign-in?expired=1&next=${encodeURIComponent(loc.pathname + loc.search)}`, { replace: true })
  }), [qc, nav, loc])

  const switchWorkspace = useCallback((id: string) => {
    write(id)
    setSelected(id)
    qc.removeQueries({ queryKey: ['w'] })
    nav('/')
  }, [qc, nav])

  const signOut = useCallback(async () => {
    await authClient.signOut()
    qc.clear()
    nav('/sign-in', { replace: true })
  }, [qc, nav])

  const value = useMemo<Session>(() => ({
    status: me.isPending ? 'loading' : anonymous || !data ? 'anonymous' : 'ready',
    me: data,
    workspace,
    role: workspace?.role ?? null,
    can: a => canDo(workspace?.role ?? null, a),
    switchWorkspace,
    refresh: () => me.refetch(),
    signOut,
  }), [me, anonymous, data, workspace, switchWorkspace, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
