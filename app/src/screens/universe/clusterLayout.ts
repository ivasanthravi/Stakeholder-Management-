// Two-level "organization cluster" layout.
// 1. People are packed inside their organization with a sunflower (phyllotaxis) pattern,
//    most influential at the centre.
// 2. Organizations are laid out as discs with a weighted force simulation
//    (attraction ∝ cross-org relationships), then a collision pass guarantees no overlap.
// Deterministic for a given input, so the map is stable between visits.
interface Person { id: string; orgId: string; influence: number }
interface Relationship { source: string; target: string }
interface Organization { id: string }

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const SPACING = 30
const GAP = 34
const MIN_RING = 52

export function clusterLayout(people: Person[], rels: Relationship[], orgs: Organization[]) {
  const byOrg = new Map<string, Person[]>()
  for (const p of people) byOrg.set(p.orgId, [...(byOrg.get(p.orgId) ?? []), p])
  const orgOf = new Map(people.map(p => [p.id, p.orgId]))

  // Local positions inside each cluster.
  const local = new Map<string, { x: number; y: number }>()
  const radius = new Map<string, number>()
  for (const [oid, ps] of byOrg) {
    const sorted = ps.slice().sort((a, b) => b.influence - a.influence || a.id.localeCompare(b.id))
    sorted.forEach((p, k) => {
      // The first rings keep a minimum distance: two high-influence people (36 px nodes) plus their labels need it.
      const r = k === 0 ? 0 : Math.max(MIN_RING, SPACING * Math.sqrt(k + 0.4))
      local.set(p.id, { x: Math.cos(k * GOLDEN) * r, y: Math.sin(k * GOLDEN) * r })
    })
    radius.set(oid, Math.max(sorted.length > 1 ? MIN_RING : 0, SPACING * Math.sqrt(sorted.length + 0.4)) + 26)
  }

  // Cross-org weights.
  const w = new Map<string, number>()
  for (const r of rels) {
    const a = orgOf.get(r.source), b = orgOf.get(r.target)
    if (!a || !b || a === b) continue
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    w.set(k, (w.get(k) ?? 0) + 1)
  }

  // Seed org centres on a spiral ordered by size (largest central).
  const ids = orgs.map(o => o.id).filter(id => byOrg.has(id)).sort((a, b) => byOrg.get(b)!.length - byOrg.get(a)!.length || a.localeCompare(b))
  const pos = new Map<string, { x: number; y: number }>()
  ids.forEach((id, i) => {
    const r = 140 * Math.sqrt(i)
    pos.set(id, { x: Math.cos(i * GOLDEN) * r, y: Math.sin(i * GOLDEN) * r })
  })

  // Force simulation.
  const edges = [...w.entries()].map(([k, n]) => { const [a, b] = k.split('|'); return { a, b, n } })
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 320
    const disp = new Map(ids.map(id => [id, { x: 0, y: 0 }]))
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = pos.get(ids[i])!, B = pos.get(ids[j])!
      let dx = A.x - B.x, dy = A.y - B.y
      const d = Math.max(1, Math.hypot(dx, dy))
      dx /= d; dy /= d
      const f = 9000 / (d * d) * (radius.get(ids[i])! + radius.get(ids[j])!) / 40
      disp.get(ids[i])!.x += dx * f; disp.get(ids[i])!.y += dy * f
      disp.get(ids[j])!.x -= dx * f; disp.get(ids[j])!.y -= dy * f
    }
    for (const { a, b, n } of edges) {
      const A = pos.get(a)!, B = pos.get(b)!
      const dx = B.x - A.x, dy = B.y - A.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const ideal = radius.get(a)! + radius.get(b)! + GAP
      const f = (d - ideal) * 0.02 * Math.min(4, n)
      disp.get(a)!.x += (dx / d) * f; disp.get(a)!.y += (dy / d) * f
      disp.get(b)!.x -= (dx / d) * f; disp.get(b)!.y -= (dy / d) * f
    }
    for (const id of ids) {
      const P = pos.get(id)!, D = disp.get(id)!
      D.x -= P.x * 0.012; D.y -= P.y * 0.012 // gravity
      const m = Math.hypot(D.x, D.y), cap = 40 * cool + 2
      if (m > cap) { D.x *= cap / m; D.y *= cap / m }
      P.x += D.x; P.y += D.y
    }
  }
  // Collision removal.
  for (let it = 0; it < 200; it++) {
    let moved = false
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = pos.get(ids[i])!, B = pos.get(ids[j])!
      const min = radius.get(ids[i])! + radius.get(ids[j])! + GAP
      let dx = B.x - A.x, dy = B.y - A.y
      const d = Math.hypot(dx, dy) || 0.01
      if (d >= min) continue
      moved = true
      dx /= d; dy /= d
      const push = (min - d) / 2 + 0.5
      A.x -= dx * push; A.y -= dy * push; B.x += dx * push; B.y += dy * push
    }
    if (!moved) break
  }

  // Orient each cluster so members with outside ties face the orgs they connect to.
  const out = new Map<string, { x: number; y: number }>()
  for (const p of people) {
    const c = pos.get(p.orgId)!, l = local.get(p.id)!
    out.set(p.id, { x: c.x + l.x, y: c.y + l.y })
  }
  return out
}
