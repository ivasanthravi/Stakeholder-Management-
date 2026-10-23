// Lets any screen open the copilot panel (optionally with a question and record context) without importing the panel.
import type { CopilotContext } from '../api/ai'

export interface CopilotOpen { message?: string; context?: CopilotContext; send?: boolean }
const EVENT = 'meridian:copilot'

export const openCopilot = (detail: CopilotOpen = {}) => window.dispatchEvent(new CustomEvent<CopilotOpen>(EVENT, { detail }))
export function onCopilotOpen(fn: (d: CopilotOpen) => void) {
  const h = (e: Event) => fn((e as CustomEvent<CopilotOpen>).detail ?? {})
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
