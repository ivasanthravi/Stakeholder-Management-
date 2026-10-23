// Chooses the billing provider from configuration. One provider is active per deployment.
import type { Env } from '../env'
import type { BillingProvider } from './provider'
import { createPaddleProvider } from './paddle'
import { createSimulator, type Simulator } from './simulator'
import { createStripeProvider } from './stripe'

export function createBilling(env: Env, opts: { simulatorStatePath?: string } = {}): { provider: BillingProvider | null; simulator: Simulator | null } {
  const raw = env as unknown as Record<string, string | undefined>
  const choice = env.BILLING_PROVIDER ?? (env.NODE_ENV === 'production' ? 'none' : 'simulator')
  if (choice === 'stripe') return { provider: createStripeProvider(raw), simulator: null }
  if (choice === 'paddle') return { provider: createPaddleProvider(raw), simulator: null }
  if (choice === 'simulator') {
    if (env.NODE_ENV === 'production') throw new Error('The billing simulator is for development only')
    const simulator = createSimulator({ secret: env.SIMULATOR_WEBHOOK_SECRET, appUrl: env.APP_URL, persistPath: opts.simulatorStatePath })
    return { provider: simulator.provider, simulator }
  }
  return { provider: null, simulator: null }
}
