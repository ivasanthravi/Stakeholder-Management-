import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { getWorkspaceId, newIdempotencyKey, qs, request, ws } from './http'
import type {
  ActivityEvent, Dashboard, Graph, Lookups, Me, Overview, Page, SearchResults, StakeholderDetail, StakeholderRow, WorkspaceInfo,
} from './types'

/** Every tenant query key starts with the workspace id, so switching workspaces can never show stale foreign data. */
export const wk = (...parts: unknown[]): QueryKey => ['w', getWorkspaceId(), ...parts]

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => request<Me>('/api/me'), retry: false, staleTime: 60_000 })
export const useWorkspace = () => useQuery({ queryKey: wk('workspace'), queryFn: () => request<WorkspaceInfo>(ws('')), staleTime: 60_000 })
export const useLookups = () => useQuery({ queryKey: wk('lookups'), queryFn: () => request<Lookups>(ws('/lookups')), staleTime: 30_000 })
export const useDashboard = () => useQuery({ queryKey: wk('dashboard'), queryFn: () => request<Dashboard>(ws('/dashboard')), staleTime: 15_000 })
export const useGraph = (initiativeId: string) => useQuery({ queryKey: wk('graph', initiativeId), queryFn: () => request<Graph>(ws(`/graph${qs({ initiativeId })}`)), placeholderData: keepPreviousData, enabled: initiativeId !== '' })
export const useSearch = (q: string) => useQuery({ queryKey: wk('search', q), queryFn: ({ signal }) => request<SearchResults>(ws(`/search${qs({ q })}`), { signal }), enabled: q.trim().length > 0, placeholderData: keepPreviousData, staleTime: 10_000 })

export interface StakeholderFilters { q?: string; stance?: string[]; minInfluence?: number; initiativeId?: string; organizationId?: string; cold?: boolean; ownerId?: string; sort?: string; dir?: 'asc' | 'desc'; archived?: boolean }
const PAGE = 100
export function useStakeholderPages(f: StakeholderFilters) {
  return useInfiniteQuery({
    queryKey: wk('stakeholders', f),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => request<Page<StakeholderRow>>(ws(`/stakeholders${qs({ ...f, cold: f.cold ? 'true' : undefined, archived: f.archived ? 'true' : undefined, limit: PAGE, offset: pageParam })}`), { signal }),
    getNextPageParam: (last, all) => { const n = all.reduce((a, p) => a + p.items.length, 0); return n < last.total ? n : undefined },
    placeholderData: keepPreviousData,
  })
}
export const useStakeholder = (id: string | null) => useQuery({ queryKey: wk('stakeholder', id), queryFn: () => request<StakeholderDetail>(ws(`/stakeholders/${id}`)), enabled: !!id })
export const useOverview = (id: string | null) => useQuery({ queryKey: wk('overview', id), queryFn: () => request<Overview>(ws(`/stakeholders/${id}/overview`)), enabled: !!id, placeholderData: keepPreviousData })
export const useActivity = (entityType: string, entityId: string | null) => useInfiniteQuery({
  queryKey: wk('activity', entityType, entityId),
  initialPageParam: 0 as number,
  queryFn: ({ pageParam }) => request<{ events: ActivityEvent[]; next: number | null }>(ws(`/activity${qs({ entityType, entityId: entityId ?? undefined, before: pageParam || undefined })}`)),
  getNextPageParam: last => last.next ?? undefined,
  enabled: !!entityId,
})

/** Generic list hook for the registers. */
export function useList<T>(resource: string, params: Record<string, string | number | boolean | undefined | string[]>, opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: wk(resource, params), queryFn: ({ signal }) => request<Page<T>>(ws(`/${resource}${qs(params)}`), { signal }), placeholderData: keepPreviousData, enabled: opts.enabled ?? true })
}
export function useRecord<T>(resource: string, id: string | null | undefined) {
  return useQuery({ queryKey: wk(resource.replace(/s$/, ''), id), queryFn: () => request<T>(ws(`/${resource}/${id}`)), enabled: !!id })
}

/** Invalidate everything derived from tenant records after a write. Cheap: queries refetch only if mounted. */
export function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['w', getWorkspaceId()] })
}

/**
 * Mutation against the current workspace. POSTs carry an idempotency key generated once per mutate() call,
 * so a retry after a dropped connection cannot create a duplicate.
 */
export function useApiMutation<TBody, TResult = unknown>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: (body: TBody) => string, opts: { invalidate?: boolean } = {}) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: TBody) => request<TResult>(ws(path(body)), {
      method,
      body: method === 'DELETE' ? undefined : stripRouting(body),
      idempotencyKey: method === 'POST' ? newIdempotencyKey() : undefined,
    }),
    onSettled: () => { if (opts.invalidate !== false) invalidate() },
  })
}
/** Bodies may carry routing fields (prefixed `_`) used to build the path; they are not sent. */
function stripRouting<T>(b: T) {
  if (!b || typeof b !== 'object') return b
  return Object.fromEntries(Object.entries(b as object).filter(([k]) => !k.startsWith('_')))
}

/** Optimistic stakeholder patch used by inline edits (stance) in the directory and map panel. */
export function usePatchStakeholder() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, version, patch }: { id: string; version: number; patch: Partial<StakeholderRow> }) =>
      request<StakeholderDetail>(ws(`/stakeholders/${id}`), { method: 'PATCH', body: { ...patch, version } }),
    onMutate: async ({ id, patch }) => {
      const key = wk('stakeholders')
      await qc.cancelQueries({ queryKey: key })
      const snapshot = qc.getQueriesData({ queryKey: key })
      qc.setQueriesData<{ pages: Page<StakeholderRow>[] }>({ queryKey: key }, d => d && ({ ...d, pages: d.pages.map(p => ({ ...p, items: p.items.map(r => (r.id === id ? { ...r, ...patch } : r)) })) }))
      return { snapshot }
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([k, v]) => qc.setQueryData(k, v)),
    onSettled: () => invalidate(),
  })
}
