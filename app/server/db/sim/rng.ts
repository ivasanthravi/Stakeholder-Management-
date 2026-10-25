// Seeded randomness for the simulation: the same seed always produces the same universe.
export type Rng = ReturnType<typeof createRng>

export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
  const chance = (p: number) => next() < p
  /** Weighted pick: weights need not sum to 1. */
  const weighted = <T,>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = next() * total
    for (const [v, w] of entries) { if ((r -= w) < 0) return v }
    return entries[entries.length - 1][0]
  }
  /** k distinct items (or all when k ≥ length). */
  const sample = <T,>(xs: readonly T[], k: number): T[] => {
    const a = xs.slice()
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
    return a.slice(0, Math.max(0, Math.min(k, a.length)))
  }
  /** Heavy-tailed weight (Pareto, alpha≈1.3): a few stakeholders get most of the engagement. */
  const pareto = () => Math.min(60, 1 / Math.pow(1 - next() * 0.999, 1 / 1.3))
  return { next, int, pick, chance, weighted, sample, pareto }
}

/** Derives a stable seed for a sub-stream (per workspace, per industry) from the run seed. */
export function subSeed(seed: number, label: string) {
  let h = seed >>> 0
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 2654435761) >>> 0
  return h
}
