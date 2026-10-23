/** Subsequence fuzzy match. Rewards contiguous runs and word starts. Returns null if no match. */
export function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] }
  const q = query.toLowerCase()
  const s = text.toLowerCase()
  const direct = s.indexOf(q)
  if (direct >= 0) {
    const wordStart = direct === 0 || /[\s\-—(/]/.test(s[direct - 1])
    return { score: 1000 - direct + (wordStart ? 200 : 0) - s.length * 0.1, hits: Array.from({ length: q.length }, (_, i) => direct + i) }
  }
  const hits: number[] = []
  let score = 0, qi = 0, prev = -2
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] !== q[qi]) continue
    const wordStart = i === 0 || /[\s\-—(/]/.test(s[i - 1])
    score += (i === prev + 1 ? 12 : 1) + (wordStart ? 18 : 0)
    hits.push(i); prev = i; qi++
  }
  return qi === q.length ? { score: score - s.length * 0.2, hits } : null
}
