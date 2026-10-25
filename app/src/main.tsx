import { lazy, StrictMode, Suspense, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useSearchParams } from 'react-router-dom'
import { safeNext } from '../shared/url'
import { MotionConfig, MotionGlobalConfig } from 'motion/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/base.css'
import { ApiError, NetworkError } from './api/http'
import { AppProvider } from './shell/context'
import { SessionProvider, useSession } from './session/session'
import { Shell } from './shell/Shell'
import { Home } from './screens/Home'
import { Stakeholders } from './screens/Stakeholders'
import { Profile } from './screens/Profile'
import { Placeholder } from './screens/Placeholder'
import { AppLoading } from './components/AppLoading'
// Route-level code splitting: the shell, Home, the directory and the profile load first; everything else on demand.
const page = (load: () => Promise<object>, name: string) => {
  const C = lazy(() => load().then(m => ({ default: (m as Record<string, ComponentType>)[name] })))
  return <Suspense fallback={null}><C /></Suspense>
}
const auth = () => import('./screens/auth/Auth')
const orgs = () => import('./screens/registers/Organizations')
const inits = () => import('./screens/registers/Initiatives')
const engs = () => import('./screens/registers/Engagements')
const decs = () => import('./screens/registers/Decisions')
const coms = () => import('./screens/registers/Commitments')
const settings = () => import('./screens/settings/Settings')
const intel = () => import('./screens/engagement/Intelligence')
const site = () => import('./marketing/pages')
const onboarding = () => import('./screens/onboarding/Onboarding')
const briefing = () => import('./screens/briefing/Briefing')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      // Retry only transient failures; a 403/404/422 will not change by retrying.
      retry: (count, err) => (err instanceof NetworkError || (err instanceof ApiError && err.status >= 500)) && count < 2,
    },
    mutations: { retry: false },
  },
})

function Root() {
  return (
    <SessionProvider>
      <AppProvider>
        <Outlet />
      </AppProvider>
    </SessionProvider>
  )
}

function RequireAuth() {
  const { status } = useSession()
  const loc = useLocation()
  if (status === 'loading') return <AppLoading />
  // Signed-out visitors to the root see the marketing homepage; everything else in the app asks them to sign in.
  if (status === 'anonymous' && loc.pathname === '/') return page(site, 'MarketingHome')
  if (status === 'anonymous') return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <Outlet />
}

function RequireWorkspace() {
  const { workspace } = useSession()
  if (!workspace) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function PublicOnly() {
  const { status } = useSession()
  const [params] = useSearchParams()
  if (status === 'loading') return <AppLoading />
  // Signing in (or arriving signed in) continues to where the visitor was going: a deep link, an expired session.
  if (status === 'ready') return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: '/sign-in', element: page(auth, 'SignIn') },
          { path: '/sign-up', element: page(auth, 'SignUp') },
          { path: '/check-email', element: page(auth, 'CheckEmail') },
          { path: '/forgot-password', element: page(auth, 'ForgotPassword') },
        ],
      },
      { path: '/reset-password', element: page(auth, 'ResetPassword') },
      // Public marketing site (same app and design system; lazy-loaded so it never weighs on the product).
      { path: '/product', element: page(site, 'ProductPage') },
      { path: '/features', element: page(site, 'FeaturesPage') },
      { path: '/stakeholder-intelligence', element: page(site, 'StakeholderIntelligencePage') },
      { path: '/relationship-mapping', element: page(site, 'RelationshipMappingPage') },
      { path: '/ai', element: page(site, 'AIPage') },
      { path: '/pricing', element: page(site, 'PricingPage') },
      { path: '/security', element: page(site, 'SecurityPage') },
      { path: '/contact', element: page(site, 'ContactPage') },
      { path: '/invite/:token', element: page(auth, 'AcceptInvite') },
      ...(import.meta.env.DEV ? [{ path: '/dev/mail', element: page(auth, 'DevMail') }] : []),
      {
        element: <RequireAuth />,
        children: [
          { path: '/onboarding', element: page(onboarding, 'CreateWorkspace') },
          {
            element: <RequireWorkspace />,
            children: [{ path: '/welcome', element: page(onboarding, 'Welcome') }, {
              element: <Shell />,
              children: [
                { path: '/', element: <Home /> },
                { path: '/stakeholders', element: <Stakeholders /> },
                { path: '/stakeholders/:id', element: <Profile /> },
                { path: '/stakeholders/:id/briefing', element: page(briefing, 'StakeholderBriefing') },
                { path: '/organizations', element: page(orgs, 'Organizations') },
                { path: '/organizations/:id', element: page(orgs, 'OrganizationPage') },
                { path: '/initiatives', element: page(inits, 'Initiatives') },
                { path: '/initiatives/:id', element: page(inits, 'InitiativePage') },
                { path: '/engagements', element: page(engs, 'Engagements') },
                { path: '/engagements/:id', element: page(engs, 'EngagementPage') },
                { path: '/engagements/:id/intelligence', element: page(intel, 'MeetingIntelligence') },
                { path: '/decisions', element: page(decs, 'Decisions') },
                { path: '/commitments', element: page(coms, 'Commitments') },
                { path: '/settings', element: page(settings, 'Settings') },
                { path: '/settings/:tab', element: page(settings, 'Settings') },
                { path: '*', element: <Placeholder /> },
              ],
            }],
          },
        ],
      },
    ],
  },
])

// Reduced motion: MotionConfig's reducedMotion="user" only drops transform and layout animation, so height, width,
// SVG and staggered reveals would still move. While the preference is on, every Motion animation completes instantly.
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
const applyReducedMotion = () => { MotionGlobalConfig.instantAnimations = !!reducedMotion?.matches }
applyReducedMotion()
reducedMotion?.addEventListener?.('change', applyReducedMotion)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
)
