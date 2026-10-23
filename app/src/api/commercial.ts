// Client for the commercial layer: billing, entitlements, onboarding, notifications, preferences, data management.
// Types mirror server/modules/{billing,notifications,data}.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, ws } from './http'
import { useApiMutation, wk } from './hooks'
import type { AccessLevel, Feature, PlanId, SubscriptionStatus } from '../../shared/plans'
import type { DisplayPrice } from '../../shared/pricing'

export interface Entitlements {
  plan: PlanId; planName: string; status: SubscriptionStatus
  access: { level: AccessLevel; reason: string; until: string | null }
  features: Feature[]; seatLimit: number | null; aiTokenAllowance: number
  trialEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean
  provider: 'none' | 'stripe' | 'paddle' | 'simulator' | 'manual'; interval: 'month' | 'year' | null; seats: number
}
export interface CatalogPlan {
  id: PlanId; name: string; tagline: string; seatLimit: number | null; aiTokensPerSeat: number; selfServe: boolean
  features: { id: Feature; label: string; planned: boolean }[]
  /** Only present once a price is approved for publication. */
  price: DisplayPrice | null
  purchasable: { month: boolean; year: boolean }
}
export interface BillingOverview {
  entitlements: Entitlements
  seats: { members: number; pending: number; used: number }
  ai: { allowance: number; adminBudget: number; used: number; reserved: number; period: string }
  canManage: boolean
  provider: { id: string; label: string; testMode: boolean } | null
  /** Admins and owners only. */
  billing: { provider: string; interval: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; paymentMethodSummary: string | null; hasCustomer: boolean; trialDays: number } | null
  plans: CatalogPlan[]
}
export interface Invoice { id: string; number: string | null; status: string; total: number; amountPaid: number; currency: string; createdAt: string; periodStart: string | null; periodEnd: string | null; url: string | null }
export interface PublicPlans { plans: CatalogPlan[]; trialDays: number; trialSeats: number; provider: { label: string; testMode: boolean } | null }

export interface OnboardingState { template: string | null; completed: string[]; dismissed: boolean; counts: { initiatives: number; stakeholders: number; engagements: number } }
export interface InboxItem { id: string; kind: string; title: string; href: string | null; readAt: string | null; createdAt: string }
export interface Preferences { notifications: Record<string, { email: boolean; inApp: boolean; label: string }>; analyticsOptOut: boolean }
export interface DataRequest { id: string; kind: 'workspace_export' | 'user_export' | 'workspace_deletion' | 'account_closure'; status: string; label: string | null; scheduledFor: string | null; createdAt: string; completedAt: string | null; fileExpiresAt: string | null; downloadable: boolean }

export type ChangeInput = { plan: PlanId; interval: 'month' | 'year'; seats: number }

// ── Queries ─────────────────────────────────────────────────────────────────
export const useBilling = () => useQuery({ queryKey: wk('billing'), queryFn: () => request<BillingOverview>(ws('/billing')), staleTime: 15_000 })
export const useInvoices = (enabled = true) => useQuery({ queryKey: wk('billing', 'invoices'), queryFn: () => request<{ invoices: Invoice[]; source: string | null }>(ws('/billing/invoices')), enabled })
export const usePublicPlans = () => useQuery({ queryKey: ['public', 'plans'], queryFn: () => request<PublicPlans>('/api/billing/plans'), staleTime: 5 * 60_000 })
export const useOnboarding = () => useQuery({ queryKey: wk('onboarding'), queryFn: () => request<OnboardingState>(ws('/onboarding')) })
export const useInbox = () => useQuery({ queryKey: wk('inbox'), queryFn: () => request<{ notifications: InboxItem[]; unread: number }>(ws('/notifications')), refetchInterval: 60_000, staleTime: 20_000 })
export const usePreferences = () => useQuery({ queryKey: ['me', 'preferences'], queryFn: () => request<Preferences>('/api/me/preferences') })
export const useDataRequests = (enabled = true) => useQuery({
  queryKey: wk('data', 'requests'), queryFn: () => request<{ requests: DataRequest[]; coolingOffDays: number; exportTtlDays: number }>(ws('/data/requests')), enabled,
  // Poll while an export is being prepared.
  refetchInterval: q => (q.state.data?.requests.some(r => r.status === 'requested' || r.status === 'processing') ? 3000 : false),
})

// ── Mutations ───────────────────────────────────────────────────────────────
export const useCheckout = () => useApiMutation<ChangeInput, { url: string }>('POST', () => '/billing/checkout', { invalidate: false })
export const usePortal = () => useApiMutation<Record<string, never>, { url: string }>('POST', () => '/billing/portal', { invalidate: false })
export const useChangePlan = () => useApiMutation<ChangeInput, { entitlements: Entitlements }>('POST', () => '/billing/change')
export const useCancelSubscription = () => useApiMutation<{ reason?: string }, { entitlements: Entitlements }>('POST', () => '/billing/cancel')
export const useResumeSubscription = () => useApiMutation<Record<string, never>, { entitlements: Entitlements }>('POST', () => '/billing/resume')
export const useRefreshBilling = () => useApiMutation<Record<string, never>, { entitlements: Entitlements }>('POST', () => '/billing/refresh')
export const useOnboardingUpdate = () => useApiMutation<{ complete?: string; dismissed?: boolean }, { ok: true }>('PATCH', () => '/onboarding')
/** Marking read only refreshes the inbox, not every workspace query. */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { ids?: string[] }) => request<{ ok: true }>(ws('/notifications/read'), { method: 'POST', body }),
    onSettled: () => qc.invalidateQueries({ queryKey: wk('inbox') }),
  })
}
export const useRequestExport = () => useApiMutation<Record<string, never>, DataRequest>('POST', () => '/data/export')
export const useScheduleDeletion = () => useApiMutation<{ confirmName: string }, DataRequest>('POST', () => '/data/deletion')
export const useCancelDeletion = () => useApiMutation<Record<string, never>, { ok: true }>('DELETE', () => '/data/deletion')
export const useResendInvite = () => useApiMutation<{ _id: string }, { id: string; expiresAt: string }>('POST', b => `/invitations/${b._id}/resend`)

/** Account-level calls (not workspace-scoped). */
export const account = {
  updatePreferences: (body: Partial<{ notifications: Record<string, { email: boolean; inApp: boolean }>; analyticsOptOut: boolean }>) => request<Preferences>('/api/me/preferences', { method: 'PUT', body }),
  updateProfile: (name: string) => request<{ name: string }>('/api/me/profile', { method: 'PATCH', body: { name } }),
  closeAccount: (confirmEmail: string) => request<{ ok: true }>('/api/me/close', { method: 'POST', body: { confirmEmail } }),
  exportUrl: '/api/me/export',
  contact: (body: { name: string; email: string; company?: string; teamSize?: string; topic: string; message: string; website?: string }) => request<{ ok: true }>('/api/contact', { method: 'POST', body }),
}

/** Downloads a workspace export through the authenticated API. */
export const exportDownloadUrl = (id: string) => ws(`/data/exports/${id}`)

/** Shared human labels. */
export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Trial', active: 'Active', past_due: 'Payment overdue', canceled: 'Canceled', expired: 'Ended', suspended: 'Suspended', incomplete: 'No plan',
}
export const formatTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
