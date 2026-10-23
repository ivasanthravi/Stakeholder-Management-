// Motion tokens — mirrors docs/design/motion-system.md. Components never hand-roll timings.
import type { Transition } from 'motion/react'

export const ease = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.3, 0, 0, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
}

export const dur = { instant: 0.08, fast: 0.14, base: 0.2, slow: 0.28, graph: 0.4 }

export const t = {
  fast: { duration: dur.fast, ease: ease.standard } satisfies Transition,
  base: { duration: dur.base, ease: ease.standard } satisfies Transition,
  slow: { duration: dur.slow, ease: ease.emphasized } satisfies Transition,
  exit: { duration: dur.fast, ease: ease.exit } satisfies Transition,
  // Critically-damped-ish spring for things that physically follow the pointer/selection.
  indicator: { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } satisfies Transition,
  panel: { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } satisfies Transition,
}

/** Panel/drawer entrance: 16px travel + fade; exits faster with exit easing. */
export const panelVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: t.base },
  exit: { opacity: 0, x: 12, transition: t.exit },
}

export const popVariants = {
  initial: { opacity: 0, scale: 0.97, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: t.fast },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.1, ease: ease.exit } },
}

export const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: t.fast },
  exit: { opacity: 0, transition: { duration: 0.1, ease: ease.exit } },
}

/** Stagger only for first reveal of a small list (≤ 8 items); never on re-render. */
export const stagger = (i: number) => ({ delay: Math.min(i, 8) * 0.025 })
