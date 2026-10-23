import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import layoutUtilities from 'cytoscape-layout-utilities'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Building2, ChevronDown, Crosshair, List, Maximize, Minus, Network, Plus, Route, Search, ScanEye, Grid2x2, X } from 'lucide-react'
import { useGraph, useList, useLookups } from '../../api/hooks'
import { usePath, type PathHop } from '../../api/ai'
import { Picker, type PickerOption } from '../../components/Picker'
import type { Graph, Stance, StakeholderRow } from '../../api/types'
import { LEVEL_LABEL, RELATIONSHIP_LABEL, STANCE_LABEL } from '../../lib/format'
import { RELATIONSHIP_TYPES } from '../../../shared/schemas'
import { Avatar, Button, Kbd, StanceBadge } from '../../components/ui'
import { LoadError } from '../Home'
import { Menu, type MenuOption } from '../../components/Menu'
import { PeekPanel } from '../directory/PeekPanel'
import { useApp } from '../../shell/context'
import { t } from '../../lib/motion'
import { buildStyle, readPalette } from './graphStyle'
import { clusterLayout } from './clusterLayout'
import './universe.css'

cytoscape.use(fcose)
cytoscape.use(layoutUtilities)

type Lens = 'network' | 'influence'
type RelationshipType = typeof RELATIONSHIP_TYPES[number]
const REL_TYPES = RELATIONSHIP_TYPES
const REL_LABEL = Object.fromEntries(RELATIONSHIP_TYPES.map(r => [r, RELATIONSHIP_LABEL[r][0]])) as Record<RelationshipType, string>
const cls = (type: string) => type.replace(/_/g, '-')
const NO_ORG = '__none'
const STANCES: Stance[] = ['opposed', 'concerned', 'neutral', 'supporter', 'champion', 'unknown']
const QUAD = 220 // influence-grid cell size in model units
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Scope { initiative: string | 'all'; stances: Stance[]; types: RelationshipType[]; group: boolean; lens: Lens }

/** A node as the map uses it: unassessed influence/interest are kept null (never guessed). */
export interface MapPerson { id: string; name: string; title: string | null; stance: Stance; influence: number | null; interest: number | null; orgId: string; gap: boolean }

function computeScope(g: Graph | undefined, sc: Scope) {
  if (!g) return { people: [] as MapPerson[], rels: [] as { id: string; source: string; target: string; type: string; strength: number }[], orgs: [] as { id: string; name: string; short: string }[], orgName: new Map<string, string>() }
  const people: MapPerson[] = g.nodes
    .filter(n => !sc.stances.length || sc.stances.includes(n.stance))
    .map(n => ({ id: n.id, name: n.name, title: n.title, stance: n.stance, influence: n.influence, interest: n.interest, orgId: n.orgId ?? NO_ORG, gap: n.gap }))
  const ids = new Set(people.map(p => p.id))
  // The map draws person-to-person relationships; organization endpoints appear in profiles.
  const rels = g.edges
    .filter(e => e.sourceKind === 'stakeholder' && e.targetKind === 'stakeholder' && ids.has(e.source) && ids.has(e.target) && (!sc.types.length || sc.types.includes(e.type as RelationshipType)))
    .map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type, strength: e.strength ?? 1 }))
  const orgName = new Map(g.orgs.map(o => [o.id, o.shortName ?? o.name]))
  const orgIds = new Set(people.map(p => p.orgId))
  const orgs = [...orgIds].map(id => ({ id, name: id === NO_ORG ? 'No organization' : g.orgs.find(o => o.id === id)?.name ?? '—', short: id === NO_ORG ? 'No org' : orgName.get(id) ?? '—' }))
  return { people, rels, orgs, orgName }
}

export default function Universe() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { announce } = useApp()
  const lookups = useLookups()
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const firstRun = useRef(true)

  // With a focus but no initiative, show everyone so the focused person is guaranteed to be in view.
  const [scope, setScope] = useState<Scope>(() => ({ initiative: params.get('initiative') ?? (params.get('focus') ? 'all' : ''), stances: [], types: [], group: true, lens: 'network' }))
  // No initiative chosen: open on the first active one (a whole-workspace map is rarely readable).
  useEffect(() => {
    if (scope.initiative || !lookups.data) return
    const first = lookups.data.initiatives.find(i => i.status === 'active') ?? lookups.data.initiatives[0]
    setScope(sc => ({ ...sc, initiative: first?.id ?? 'all' }))
  }, [lookups.data, scope.initiative])
  const [sel, setSel] = useState<string | null>(params.get('focus'))
  const hoverRef = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [gaps, setGaps] = useState(false)
  // On phones the list is the primary representation; the canvas is opt-in.
  const [list, setList] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [menu, setMenu] = useState<{ kind: 'init' | 'stance' | 'type'; el: HTMLElement } | null>(null)
  // Path finder: shortest chain of recorded relationships between two people (deterministic, server-side).
  const [pathOpen, setPathOpen] = useState(false)
  const [pathEnds, setPathEnds] = useState<{ from: string | null; to: string | null }>({ from: null, to: null })
  const path = usePath(pathOpen ? pathEnds.from : null, pathOpen ? pathEnds.to : null)

  // Keep URL in sync with scope/selection so views are shareable.
  // Debounced: rapid arrow-key traversal shouldn't re-render the route on every step.
  useEffect(() => {
    const h = setTimeout(() => {
      const n = new URLSearchParams(params)
      n.set('view', 'map'); if (scope.initiative) n.set('initiative', scope.initiative)
      if (sel) n.set('focus', sel); else n.delete('focus')
      if (n.toString() !== params.toString()) setParams(n, { replace: true })
    }, 250)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.initiative, sel])

  // If the scope changes from outside (sidebar initiative links), follow it.
  useEffect(() => {
    const i = params.get('initiative')
    if (i && i !== scope.initiative) setScope(sc => ({ ...sc, initiative: i }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('initiative')])

  const graph = useGraph(scope.initiative)
  const data = useMemo(() => computeScope(graph.data, scope), [graph.data, scope])
  const byId = useMemo(() => new Map(data.people.map(p => [p.id, p])), [data.people])
  // A focus outside the chosen initiative widens the scope rather than silently showing nothing.
  useEffect(() => {
    const f = params.get('focus')
    if (graph.data && f && scope.initiative !== 'all' && !graph.data.nodes.some(n => n.id === f)) setScope(sc => ({ ...sc, initiative: 'all' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.data])

  const pathSet = useMemo(() => {
    const r = path.data
    if (!pathOpen || !r?.found || !r.hops.length) return null
    const nodes = new Set(r.hops.flatMap(h => [h.from.id, h.to.id]))
    const edges = new Map(r.hops.map(h => [h.relationshipId, h.status]))
    return { nodes, edges }
  }, [path.data, pathOpen])

  // ── Mount Cytoscape once ──────────────────────────────────────────
  useEffect(() => {
    const pal = readPalette()
    const cy = cytoscape({
      container: containerRef.current!,
      style: buildStyle(pal),
      minZoom: 0.15, maxZoom: 3,
      boxSelectionEnabled: false,
      selectionType: 'single',
      autounselectify: true,
      pixelRatio: 'auto',
      textureOnViewport: false,
      hideEdgesOnViewport: false,
    })
    ;(cy as unknown as { layoutUtilities: (o: object) => void }).layoutUtilities({ desiredAspectRatio: 1.5, componentSpacing: 60 })
    cyRef.current = cy
    firstRun.current = true
    if (import.meta.env.DEV) (window as unknown as { __cy: Core }).__cy = cy
    // Hover is applied imperatively (no React render per pointer move); one rAF per change.
    let raf = 0
    const setHover = (id: string | null) => {
      hoverRef.current = id
      hoverStore.set(id)
      // Dwell: sweeping across nodes doesn't restyle the graph on every pass.
      clearTimeout(raf)
      raf = window.setTimeout(() => requestAnimationFrame(() => applyVisual.current()), id ? 40 : 60)
    }
    cy.on('mouseover', 'node.person', e => setHover(e.target.id()))
    cy.on('mouseout', 'node.person', () => setHover(null))
    cy.on('tap', 'node.person', e => setSel(e.target.id()))
    cy.on('dbltap', 'node.person', e => nav(`/stakeholders/${e.target.id()}`))
    cy.on('tap', e => { if (e.target === cy) setSel(null) })
    cy.on('zoom', () => setZoom(cy.zoom()))
    // The container can mount at 0×0 inside the view transition; keep Cytoscape's viewport in sync.
    let lastW = 0
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      cy.resize()
      if (lastW === 0 && w > 0 && !firstRun.current) cy.fit(cy.elements(), 56)
      lastW = w
    })
    ro.observe(containerRef.current!)
    return () => { ro.disconnect(); cy.destroy(); cyRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync elements + layout when scope changes ─────────────────────
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !graph.data) return
    const want: ElementDefinition[] = []
    const groupBy = scope.group && scope.lens === 'network'
    if (groupBy) for (const o of data.orgs) want.push({ group: 'nodes', data: { id: `org-${o.id}`, label: o.short, full: o.name }, classes: 'org' })
    if (scope.lens === 'influence') {
      const quads = [
        ['q-ks', 'Keep satisfied', 0, 0], ['q-mc', 'Manage closely', 1, 0],
        ['q-mo', 'Monitor', 0, 1], ['q-ki', 'Keep informed', 1, 1],
      ] as const
      for (const [id, label, cx, cyy] of quads) want.push({ group: 'nodes', data: { id, label }, classes: 'quad', position: { x: cx * QUAD * 2 + QUAD, y: cyy * QUAD * 2 + QUAD }, selectable: false, grabbable: false })
    }
    for (const p of data.people) {
      want.push({
        group: 'nodes',
        data: { id: p.id, label: p.name, stance: p.stance, influence: p.influence ?? 1, parent: groupBy ? `org-${p.orgId}` : undefined, gap: p.gap ? 1 : 0 },
        classes: 'person',
      })
    }
    for (const r of data.rels) want.push({ group: 'edges', data: { id: r.id, source: r.source, target: r.target, type: r.type, strength: r.strength, label: REL_LABEL[r.type as RelationshipType] ?? r.type }, classes: `rel rel-${cls(r.type)}` })

    const wantIds = new Set(want.map(w => w.data.id!))
    const animate = !firstRun.current && !reduceMotion()

    cy.batch(() => {
      // Remove stale (fade persons out first when animating).
      const stale = cy.elements().filter(e => !wantIds.has(e.id()))
      if (animate) {
        stale.edges().remove()
        const leaving = stale.nodes('.person').addClass('leaving')
        setTimeout(() => leaving.remove(), 150)
        stale.nodes(':not(.person)').remove()
      } else stale.remove()

      // Re-parent existing nodes if grouping changed.
      for (const w of want) {
        if (w.group !== 'nodes' || !w.classes?.includes('person')) continue
        const n = cy.getElementById(w.data.id!)
        if (n.nonempty() && (n.data('parent') ?? undefined) !== w.data.parent) {
          n.move({ parent: w.data.parent ?? null })
        }
      }
      // Add new elements (nodes before edges).
      const addNodes = want.filter(w => w.group === 'nodes' && cy.getElementById(w.data.id!).empty())
      const added = cy.add(addNodes)
      if (animate) added.filter('.person').addClass('leaving')
      const addEdges = want.filter(w => w.group === 'edges' && cy.getElementById(w.data.id!).empty())
      cy.add(addEdges)
      cy.edges().toggleClass('gridhide', scope.lens === 'influence')
      // Update data that may have changed (stance edits elsewhere).
      for (const w of want) if (w.group === 'nodes' && w.classes === 'person') cy.getElementById(w.data.id!).data({ stance: w.data.stance, gap: w.data.gap })
    })

    const done = () => {
      cy.resize()
      cy.nodes('.person.leaving').filter(n => wantIds.has(n.id())).removeClass('leaving')
      if (firstRun.current) {
        cy.fit(cy.elements(), 56)
        capZoom(cy)
        firstRun.current = false
        setReady(true)
        const f = params.get('focus')
        if (f && cy.getElementById(f).nonempty()) centerOn(cy, f, false)
      } else {
        cy.animate({ fit: { eles: cy.elements(), padding: 56 } }, { duration: animate ? 400 : 0, easing: 'ease-in-out-cubic', complete: () => capZoom(cy, animate) })
      }
      setZoom(cy.zoom())
    }

    if (scope.lens === 'influence') {
      // Each influence×interest cell packs its members in a small sunflower around the cell centre.
      // People without an influence/interest assessment sit in a labelled row below the grid — never guessed into a cell.
      const cells = new Map<string, MapPerson[]>()
      const unassessed: MapPerson[] = []
      for (const p of data.people) {
        if (!p.influence || !p.interest) { unassessed.push(p); continue }
        const k = `${p.influence}-${p.interest}`; cells.set(k, [...(cells.get(k) ?? []), p])
      }
      const target = new Map<string, { x: number; y: number }>()
      const CELL = (QUAD * 4) / 4
      unassessed.sort((x, y) => x.name.localeCompare(y.name)).forEach((p, k) => target.set(p.id, { x: 30 + (k % 24) * 36, y: QUAD * 4 + 70 + Math.floor(k / 24) * 40 }))
      for (const ps of cells.values()) {
        ps.sort((x, y) => x.name.localeCompare(y.name)).forEach((p, k) => {
          const cx = (p.interest! - 0.5) * CELL, cy0 = (4 - p.influence! + 0.5) * CELL
          const r = k === 0 ? 0 : 27 * Math.sqrt(k)
          const a = k * Math.PI * (3 - Math.sqrt(5))
          target.set(p.id, { x: cx + Math.cos(a) * r, y: cy0 + Math.sin(a) * r })
        })
      }
      cy.layout({
        name: 'preset',
        positions: ((n: NodeSingular) => target.get(n.id()) ?? n.position()) as unknown as cytoscape.NodePositionMap,
        animate, animationDuration: 420, animationEasing: 'ease-in-out-cubic', fit: false,
      } as cytoscape.PresetLayoutOptions).run()
      done()
    } else if (groupBy) {
      const target = clusterLayout(data.people.map(p => ({ ...p, influence: p.influence ?? 0 })), data.rels, data.orgs)
      cy.layout({
        name: 'preset',
        positions: ((n: NodeSingular) => target.get(n.id()) ?? n.position()) as unknown as cytoscape.NodePositionMap,
        animate, animationDuration: 420, animationEasing: 'ease-in-out-cubic', fit: false,
      } as cytoscape.PresetLayoutOptions).run()
      done()
    } else {
      const layout = cy.layout({
        name: 'fcose',
        quality: 'default',
        randomize: firstRun.current,
        animate,
        animationDuration: 420,
        animationEasing: 'ease-in-out-cubic',
        fit: false,
        padding: 40,
        packComponents: true,
        nodeRepulsion: () => 5200,
        idealEdgeLength: () => 64,
        edgeElasticity: () => 0.4,
        gravity: 0.35,
        numIter: 1500,
      } as unknown as cytoscape.LayoutOptions)
      layout.one('layoutstop', done)
      layout.run()
    }
    announce(`Showing ${data.people.length} stakeholders and ${data.rels.length} relationships`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, scope.lens, scope.group, graph.data])

  // ── Visual state: hover / selection / search / gaps ──────────────
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const orgFull = new Map(data.orgs.map(o => [o.id, o.name.toLowerCase()]))
    return new Set(data.people.filter(p => p.name.toLowerCase().includes(q) || (orgFull.get(p.orgId) ?? '').includes(q)).map(p => p.id))
  }, [query, data.people, data.orgs])

  const applyVisual = useRef(() => {})
  applyVisual.current = () => {
    const cy = cyRef.current
    if (!cy) return
    // Compute the target state, then touch only elements whose classes change (restyle is the cost).
    const want = new Map<string, string[]>()
    const add = (id: string, c: string) => { const l = want.get(id); if (l) l.push(c); else want.set(id, [c]) }
    const focusId = hoverRef.current ?? sel
    if (matches) {
      cy.nodes('.person').forEach(n => add(n.id(), matches.has(n.id()) ? 'match' : 'faded'))
      cy.edges().forEach(e => add(e.id(), 'faded'))
    } else if (gaps) {
      cy.nodes('.person').forEach(n => add(n.id(), n.data('gap') ? 'gapped' : 'faded'))
      cy.edges().forEach(e => add(e.id(), 'faded'))
    } else if (pathSet) {
      cy.nodes('.person').forEach(n => add(n.id(), pathSet.nodes.has(n.id()) ? 'path' : 'faded'))
      cy.edges().forEach(e => {
        const st = pathSet.edges.get(e.id())
        if (st === undefined) add(e.id(), 'faded')
        else { add(e.id(), 'path'); if (st !== 'confirmed') add(e.id(), 'path-inferred') }
      })
      cy.nodes('.org').forEach(o => { if (!o.children().some(c => pathSet.nodes.has((c as NodeSingular).id()))) add(o.id(), 'org-dim') })
    } else if (focusId) {
      const n = cy.getElementById(focusId)
      if (n.nonempty()) {
        const hood = n.closedNeighborhood()
        // Never fade compound parents: Cytoscape multiplies parent opacity into children.
        cy.elements().forEach(e => { if (!e.hasClass('org') && !e.hasClass('quad') && !hood.has(e)) add(e.id(), 'faded') })
        cy.nodes('.org').forEach(o => { if (o.children().intersection(hood).empty()) add(o.id(), 'org-dim') })
        hood.edges().forEach(e => add(e.id(), 'hl'))
        hood.nodes().forEach(x => { if (x.id() !== focusId) add(x.id(), 'nb') })
      }
    }
    if (sel) add(sel, 'sel')
    const MANAGED = ['faded', 'hl', 'sel', 'nb', 'match', 'gapped', 'org-dim', 'path', 'path-inferred']
    cy.batch(() => {
      cy.elements().forEach(e => {
        const target = want.get(e.id()) ?? []
        for (const c of MANAGED) {
          const on = target.includes(c)
          if (on !== e.hasClass(c)) { if (on) e.addClass(c); else e.removeClass(c) }
        }
      })
    })
  }
  useEffect(() => { applyVisual.current() }, [sel, matches, gaps, data, pathSet])

  // Path found: bring the whole chain into view.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !pathSet || !ready) return
    const eles = cy.nodes('.person').filter(n => pathSet.nodes.has(n.id()))
    if (eles.nonempty()) cy.animate({ fit: { eles, padding: 140 } }, { duration: reduceMotion() ? 0 : 400, easing: 'ease-in-out-cubic', complete: () => capZoom(cy) })
  }, [pathSet, ready])

  // Camera: centre selection only if it sits outside the central 60% of the viewport.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !sel || !ready) return
    const n = cy.getElementById(sel)
    if (n.empty()) return
    const rp = n.renderedPosition(), w = cy.width(), h = cy.height()
    if (rp.x < w * 0.2 || rp.x > w * 0.8 - (w > 900 ? 220 : 0) || rp.y < h * 0.2 || rp.y > h * 0.8) centerOn(cy, sel, true)
    const p = byId.get(sel)
    if (p) announce(`${p.name}, ${STANCE_LABEL[p.stance]}, ${p.influence ? `${LEVEL_LABEL[p.influence]} influence` : 'influence not assessed'}, ${n.connectedEdges().length} connections in view`)
  }, [sel, ready, announce, byId])

  // Search: fit camera to matches.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !matches || !matches.size) return
    const h = setTimeout(() => {
      const eles = cy.nodes().filter(n => matches.has(n.id()))
      cy.animate({ fit: { eles, padding: 120 } }, { duration: reduceMotion() ? 0 : 360, easing: 'ease-in-out-cubic' })
    }, 180)
    return () => clearTimeout(h)
  }, [matches])

  // ── Keyboard ──────────────────────────────────────────────────────
  const moveDir = useCallback((dx: number, dy: number) => {
    const cy = cyRef.current
    if (!cy) return
    if (!sel) {
      const top = cy.nodes('.person').max(n => n.data('influence') * 100 + n.degree(false)).ele
      if (top) setSel(top.id())
      return
    }
    const n = cy.getElementById(sel)
    const p0 = n.position()
    const cands = n.neighborhood('node.person').length ? n.neighborhood('node.person') : cy.nodes('.person').difference(n)
    let best: string | null = null, bestScore = Infinity
    cands.forEach(c => {
      const v = { x: c.position().x - p0.x, y: c.position().y - p0.y }
      const dist = Math.hypot(v.x, v.y)
      if (!dist) return
      const cos = (v.x * dx + v.y * dy) / dist
      if (cos < 0.35) return
      const score = dist * (2 - cos)
      if (score < bestScore) { bestScore = score; best = c.id() }
    })
    if (best) setSel(best)
  }, [sel])

  const onKey = (e: ReactKeyboardEvent) => {
    const cy = cyRef.current
    if (!cy) return
    const k = e.key
    if (k === 'ArrowRight') moveDir(1, 0)
    else if (k === 'ArrowLeft') moveDir(-1, 0)
    else if (k === 'ArrowUp') moveDir(0, -1)
    else if (k === 'ArrowDown') moveDir(0, 1)
    else if (k === ']' || k === '[') {
      if (!sel) return moveDir(1, 0)
      const nb = cy.getElementById(sel).neighborhood('node.person').nodes().sort((a, b) => a.position().x - b.position().x)
      if (!nb.length) return
      setSel(nb[(k === ']' ? 0 : nb.length - 1)].id())
    }
    else if (k === 'Enter' && sel) nav(`/stakeholders/${sel}`)
    else if (k === 'Escape') { if (sel) setSel(null); else return }
    else if (k === '+' || k === '=') zoomBy(1.25)
    else if (k === '-') zoomBy(0.8)
    else if (k === '0') fitAll()
    else if (k === 'l') setList(v => !v)
    else if (k === 'g') setGaps(v => !v)
    else return
    e.preventDefault(); e.stopPropagation()
  }

  const zoomBy = (f: number) => {
    const cy = cyRef.current!
    cy.animate({ zoom: { level: Math.max(0.15, Math.min(3, cy.zoom() * f)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: reduceMotion() ? 0 : 200, easing: 'ease-out-cubic' })
  }
  const fitAll = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 56 } }, { duration: reduceMotion() ? 0 : 360, easing: 'ease-in-out-cubic' })

  const initiatives = lookups.data?.initiatives ?? []
  const initiative = initiatives.find(i => i.id === scope.initiative)
  const gapCount = useMemo(() => data.people.filter(p => p.gap).length, [data])

  const initOpts: MenuOption[] = [{ value: 'all', label: 'All initiatives' }, ...initiatives.map(i => ({ value: i.id, label: i.name, hint: i.code }))]
  const stanceOpts: MenuOption<Stance>[] = STANCES.map(x => ({ value: x, label: STANCE_LABEL[x], icon: <StanceBadge stance={x} compact /> }))
  const typeOpts: MenuOption<RelationshipType>[] = REL_TYPES.map(x => ({ value: x, label: REL_LABEL[x], icon: <span className={`edge-key ek-${cls(x)}`} /> }))

  return (
    <div className="uni" data-panel={sel ? true : undefined}>
      <div className="uni-bar">
        <label className="search-field uni-search">
          <Search size={14} className="c3" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find in map" aria-label="Find stakeholder in map"
            onKeyDown={e => {
              if (e.key === 'Enter' && matches?.size) { setSel([...matches][0]); setQuery(''); containerRef.current?.focus() }
              if (e.key === 'Escape') { setQuery(''); containerRef.current?.focus() }
            }} />
          {query && <span className="t-small c3 num">{matches?.size ?? 0}</span>}
        </label>
        <button className="chip chip-on" onClick={e => setMenu({ kind: 'init', el: e.currentTarget })} aria-haspopup="listbox">
          <span className="chip-main"><span className="chip-k">Initiative</span><span className="chip-v">{initiative?.name ?? 'All'}</span><ChevronDown size={12} /></span>
        </button>
        <button className={`chip ${scope.stances.length ? 'chip-on' : ''}`} onClick={e => setMenu({ kind: 'stance', el: e.currentTarget })} aria-haspopup="listbox">
          <span className="chip-main"><span className="chip-k">Stance</span>{scope.stances.length ? <span className="chip-v">{scope.stances.map(x => STANCE_LABEL[x]).join(', ')}</span> : <ChevronDown size={12} />}</span>
        </button>
        <button className={`chip ${scope.types.length ? 'chip-on' : ''}`} onClick={e => setMenu({ kind: 'type', el: e.currentTarget })} aria-haspopup="listbox">
          <span className="chip-main"><span className="chip-k">Relationship</span>{scope.types.length ? <span className="chip-v">{scope.types.map(x => REL_LABEL[x]).join(', ')}</span> : <ChevronDown size={12} />}</span>
        </button>
        {(scope.stances.length > 0 || scope.types.length > 0) && <button className="link-btn" onClick={() => setScope(sc => ({ ...sc, stances: [], types: [] }))}>Reset</button>}
        <span className="grow" />
        <div className="seg" role="radiogroup" aria-label="Lens">
          {([['network', 'Network', Network], ['influence', 'Influence grid', Grid2x2]] as const).map(([v, l, I]) => (
            <button key={v} role="radio" aria-checked={scope.lens === v} className="seg-btn" onClick={() => setScope(sc => ({ ...sc, lens: v }))}>
              {scope.lens === v && <motion.span layoutId="lens-on" className="seg-on" transition={t.indicator} />}
              <I size={13} /><span>{l}</span>
            </button>
          ))}
        </div>
        <button className={`tool-btn ${scope.group ? 'on' : ''}`} aria-pressed={scope.group} disabled={scope.lens !== 'network'} onClick={() => setScope(sc => ({ ...sc, group: !sc.group }))} title="Group people by organization">
          <Building2 size={14} /><span>Group</span>
        </button>
        <button className={`tool-btn ${gaps ? 'on on-attention' : ''}`} aria-pressed={gaps} onClick={() => setGaps(v => !v)} title="Highlight high-influence stakeholders with no owner or no contact in 60 days (G)">
          <ScanEye size={14} /><span>Gaps</span><span className="num tool-count">{gapCount}</span>
        </button>
        <button className={`tool-btn ${pathOpen ? 'on' : ''}`} aria-pressed={pathOpen} title="Find a chain of recorded relationships between two people"
          onClick={() => { if (!pathOpen && sel && !pathEnds.from) setPathEnds(pe => ({ ...pe, from: sel })); setPathOpen(v => !v) }}>
          <Route size={14} /><span>Find path</span>
        </button>
        <button className={`tool-btn ${list ? 'on' : ''}`} aria-pressed={list} onClick={() => setList(v => !v)} title="Accessible list view (L)">
          <List size={14} /><span>List</span>
        </button>
      </div>

      <div className="uni-stage">
        <motion.div
          ref={containerRef}
          className="uni-canvas"
          tabIndex={0}
          role="application"
          aria-roledescription="relationship map"
          aria-label={`Relationship map, ${data.people.length} stakeholders. Arrow keys move between connected people, Enter opens profile, L for list view.`}
          onKeyDown={onKey}
          initial={false}
          animate={{ opacity: ready && !list ? 1 : 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
          style={{ pointerEvents: list ? 'none' : undefined }}
        />

        {scope.lens === 'influence' && !list && (
          <div className="axis-note" aria-hidden>
            <span>↑ Influence</span><span>Interest →</span>
          </div>
        )}

        <AnimatePresence>
          {list && <ListView key="list" people={data.people} rels={data.rels} orgs={data.orgs} sel={sel} onSel={setSel} />}
        </AnimatePresence>

        {!sel && !list && !pathOpen && <HoverCard byId={byId} orgName={data.orgName} />}
        <AnimatePresence>
          {pathOpen && (
            <PathFinder key="path" ends={pathEnds} onEnds={setPathEnds} people={data.people} loading={path.isFetching} error={path.isError ? path.error : null}
              result={path.data && pathEnds.from && pathEnds.to && pathEnds.from !== pathEnds.to ? path.data : null}
              edges={graph.data?.edges ?? []} inMap={byId}
              onShowAll={() => setScope(sc => ({ ...sc, initiative: 'all', stances: [], types: [] }))}
              onPick={id => setSel(id)}
              onClose={() => { setPathOpen(false); containerRef.current?.focus() }} />
          )}
        </AnimatePresence>
        {graph.isError && <div className="uni-loading"><LoadError error={graph.error} onRetry={() => graph.refetch()} /></div>}
        {graph.data && graph.data.nodes.length === 0 && (
          <div className="uni-loading uni-empty">
            <p className="t-heading">No stakeholders {initiative ? `in ${initiative.code}` : 'yet'}</p>
            <p className="c2 t-small">{initiative ? 'Add stakeholders to this initiative to see how they connect.' : 'Add stakeholders and relationships to build the map.'}</p>
            {initiative && <Button size="sm" onClick={() => nav(`/initiatives/${initiative.id}`)}>Open {initiative.code}</Button>}
          </div>
        )}

        <div className="uni-legend" aria-hidden={list}>
          <div className="lg-row">
            {(['opposed', 'concerned', 'neutral', 'supporter', 'champion'] as Stance[]).map(x => <span key={x} className="lg-item"><i className={`lg-dot lg-${x}`} />{STANCE_LABEL[x]}</span>)}
          </div>
          <div className="lg-row c3">
            <span className="lg-item"><i className="lg-size" />Size = influence</span>
            <span className="lg-item"><span className="edge-key ek-influences" />Influence</span>
            <span className="lg-item"><span className="edge-key ek-opposes" />Opposes</span>
          </div>
        </div>

        <div className="uni-zoom" role="toolbar" aria-label="Zoom">
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in (+)" title="Zoom in (+)"><Plus size={14} /></button>
          <span className="num t-micro c3" aria-live="off">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomBy(0.8)} aria-label="Zoom out (−)" title="Zoom out (−)"><Minus size={14} /></button>
          <span className="zsep" />
          <button onClick={fitAll} aria-label="Fit to screen (0)" title="Fit (0)"><Maximize size={13} /></button>
          {sel && <button onClick={() => centerOn(cyRef.current!, sel, true)} aria-label="Centre on selection" title="Centre on selection"><Crosshair size={13} /></button>}
        </div>

        <div className="uni-count t-small c3 num">
          {data.people.length} people · {data.rels.length} relationships · {data.orgs.length} organizations
          {!sel && !list && <span className="uni-hint"> · <Kbd>←</Kbd><Kbd>→</Kbd> to traverse</span>}
        </div>

        {!ready && !graph.isError && !(graph.data && graph.data.nodes.length === 0) && <div className="uni-loading"><span className="t-small c3">{graph.data ? `Laying out ${data.people.length} stakeholders…` : 'Loading relationships…'}</span></div>}

        <AnimatePresence>
          {sel && byId.has(sel) && <PeekPanel key="panel" id={sel} context="map" onClose={() => { setSel(null); containerRef.current?.focus() }}
            note={(() => { const n = cyRef.current?.getElementById(sel); return n && n.nonempty() ? `${n.connectedEdges().length} relationship${n.connectedEdges().length === 1 ? '' : 's'} shown in this view; the full list is below.` : undefined })()} />}
        </AnimatePresence>
      </div>

      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'init'} onClose={() => setMenu(null)} label="Initiative" options={initOpts} selected={[scope.initiative]}
        onSelect={v => setScope(sc => ({ ...sc, initiative: v }))} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'stance'} onClose={() => setMenu(null)} label="Stance" multi options={stanceOpts} selected={scope.stances}
        onSelect={v => setScope(sc => ({ ...sc, stances: sc.stances.includes(v) ? sc.stances.filter(x => x !== v) : [...sc.stances, v] }))} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'type'} onClose={() => setMenu(null)} label="Relationship type" multi options={typeOpts} selected={scope.types}
        onSelect={v => setScope(sc => ({ ...sc, types: sc.types.includes(v) ? sc.types.filter(x => x !== v) : [...sc.types, v] }))} />
    </div>
  )
}

/** Small graphs shouldn't be blown up to fill the screen: keep "fit" at or below 120%. */
function capZoom(cy: Core, animate = false) {
  if (cy.zoom() <= 1.2) return
  const opts = { zoom: { level: 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }
  if (animate && !reduceMotion()) cy.animate(opts, { duration: 200 }); else cy.zoom(opts.zoom)
}

function centerOn(cy: Core, id: string, animate: boolean) {
  const n = cy.getElementById(id)
  if (n.empty()) return
  const z = Math.max(cy.zoom(), 0.9)
  const panelOffset = cy.width() > 900 ? 220 : 0 // keep node clear of the side panel
  const pan = { x: cy.width() / 2 - panelOffset - n.position().x * z, y: cy.height() / 2 - n.position().y * z }
  if (animate && !reduceMotion()) cy.animate({ zoom: z, pan }, { duration: 400, easing: 'ease-in-out-cubic' })
  else { cy.zoom(z); cy.pan(pan) }
}

function ListView({ people, rels, orgs, sel, onSel }: { people: MapPerson[]; rels: { source: string; target: string }[]; orgs: { id: string; name: string }[]; sel: string | null; onSel: (id: string) => void }) {
  const orgFull = useMemo(() => new Map(orgs.map(o => [o.id, o.name])), [orgs])
  const byOrg = useMemo(() => {
    const m = new Map<string, MapPerson[]>()
    for (const p of people) m.set(p.orgId, [...(m.get(p.orgId) ?? []), p])
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [people])
  const deg = useMemo(() => {
    const d = new Map<string, number>()
    for (const r of rels) { d.set(r.source, (d.get(r.source) ?? 0) + 1); d.set(r.target, (d.get(r.target) ?? 0) + 1) }
    return d
  }, [rels])
  return (
    <motion.div className="uni-list" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.base }} exit={{ opacity: 0, transition: t.exit }}>
      <div className="uni-list-inner" role="tree" aria-label="Stakeholders by organization">
        {byOrg.map(([oid, ps]) => (
          <div key={oid} role="treeitem" aria-expanded="true" aria-label={orgFull.get(oid)}>
            <div className="ul-org"><Building2 size={13} className="c3" /><span className="t-strong">{orgFull.get(oid)}</span><span className="c3 t-small num">{ps.length}</span></div>
            <div role="group">
              {ps.slice().sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0)).map(p => (
                <button key={p.id} role="treeitem" aria-selected={sel === p.id} className="ul-item" data-sel={sel === p.id || undefined} onClick={() => onSel(p.id)}>
                  <Avatar name={p.name} size={20} />
                  <span className="truncate t-strong">{p.name}</span>
                  <span className="truncate c3 t-small grow">{p.title}</span>
                  <StanceBadge stance={p.stance} />
                  <span className="t-small c2 num ul-deg">{deg.get(p.id) ?? 0} links</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {people.length === 0 && <p className="c2" style={{ padding: 40, textAlign: 'center' }}>No stakeholders match these filters.</p>}
      </div>
    </motion.div>
  )
}

// ── Path finder ──────────────────────────────────────────────────────────────
/** Stakeholder search for the path finder: people on the map first, then server-side search as you type. */
function PersonPick({ id, label, value, onChange, people }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void; people: MapPerson[] }) {
  const [q, setQ] = useState('')
  const list = useList<StakeholderRow>('stakeholders', { q, limit: 20, sort: 'name' }, { enabled: !!q })
  const [known, setKnown] = useState<PickerOption[]>([])
  const mapOpts = useMemo<PickerOption[]>(() => people.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name, sub: p.title ?? undefined, icon: <Avatar name={p.name} size={18} /> })), [people])
  const options = useMemo<PickerOption[]>(() => (q ? (list.data?.items ?? []).map(s => ({ value: s.id, label: s.name, sub: s.primaryOrg?.shortName ?? s.title ?? undefined, icon: <Avatar name={s.name} size={18} /> })) : mapOpts), [q, list.data, mapOpts])
  return (
    <div className="pf-field">
      <label htmlFor={id} className="t-caption c3">{label}</label>
      <Picker id={id} options={options} loading={!!q && list.isFetching} onQuery={setQ} selectedOptions={[...known, ...mapOpts]} value={value}
        onChange={v => { const o = options.find(x => x.value === v); if (o) setKnown(k => [o, ...k.filter(x => x.value !== o.value)]); onChange((v as string | null) ?? null) }}
        placeholder="Search stakeholders" emptyText={q ? 'No matching stakeholder' : 'Type to search'} />
    </div>
  )
}

function PathFinder({ ends, onEnds, people, loading, error, result, edges, inMap, onShowAll, onPick, onClose }: {
  ends: { from: string | null; to: string | null }; onEnds: (e: { from: string | null; to: string | null }) => void
  people: MapPerson[]; loading: boolean; error: unknown; result: { found: boolean; hops: PathHop[]; method: string } | null
  edges: Graph['edges']; inMap: Map<string, MapPerson>; onShowAll: () => void; onPick: (id: string) => void; onClose: () => void
}) {
  const byEdge = useMemo(() => new Map(edges.map(e => [e.id, e])), [edges])
  const offMap = result?.found ? [...new Set(result.hops.flatMap(h => [h.from.id, h.to.id]))].filter(id => !inMap.has(id)).length : 0
  const same = !!ends.from && ends.from === ends.to
  return (
    <motion.section className="pathfinder" aria-labelledby="pf-h" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
      <header className="pf-head">
        <Route size={14} className="c3" aria-hidden />
        <h2 id="pf-h" className="t-strong grow">Find a path</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close path finder" title="Close"><X size={14} /></button>
      </header>
      <div className="pf-ends">
        <PersonPick id="pf-from" label="From" value={ends.from} onChange={v => onEnds({ ...ends, from: v })} people={people} />
        <button className="icon-btn pf-swap" onClick={() => onEnds({ from: ends.to, to: ends.from })} aria-label="Swap from and to" title="Swap" disabled={!ends.from && !ends.to}><ArrowLeftRight size={13} /></button>
        <PersonPick id="pf-to" label="To" value={ends.to} onChange={v => onEnds({ ...ends, to: v })} people={people} />
      </div>
      <div className="pf-result" aria-live="polite">
        {same ? <p className="t-small c2">Pick two different people.</p>
          : !ends.from || !ends.to ? <p className="t-small c3">Choose two stakeholders to see how they connect through recorded relationships.</p>
          : loading && !result ? <p className="t-small c3">Looking for a chain of recorded relationships…</p>
          : error ? <p className="t-small pf-err">Couldn’t look up a path. Try again.</p>
          : result && !result.found ? <p className="t-small c2">No chain of recorded relationships (up to 4 steps) connects them in records you can see.</p>
          : result ? (
            <>
              <p className="t-small c2">{result.hops.length} step{result.hops.length === 1 ? '' : 's'} through recorded relationships:</p>
              <ol className="pf-hops">
                {result.hops.map(h => {
                  const e = byEdge.get(h.relationshipId)
                  const labels = RELATIONSHIP_LABEL[h.type] ?? [h.type.replace(/_/g, ' '), h.type.replace(/_/g, ' ')]
                  // The server walks relationships in either direction; the map's edge tells us which way it was recorded.
                  const dir = e ? (e.source === h.from.id ? 'fwd' : 'rev') : null
                  const rel = (dir === 'rev' ? labels[1] : labels[0]).toLowerCase()
                  const confirmed = h.status === 'confirmed'
                  return (
                    <li key={h.relationshipId} className="pf-hop">
                      <button className="pf-name" onClick={() => onPick(h.from.id)} disabled={!inMap.has(h.from.id)}>{h.from.name}</button>
                      <span className="pf-rel" data-inferred={!confirmed || undefined}>{dir ? `—${rel}→` : `— ${rel} —`}</span>
                      <button className="pf-name" onClick={() => onPick(h.to.id)} disabled={!inMap.has(h.to.id)}>{h.to.name}</button>
                      {!confirmed && <span className="pf-status" title="Recorded as inferred — not confirmed">{h.status === 'inferred' ? 'Inferred, unconfirmed' : h.status}</span>}
                    </li>
                  )
                })}
              </ol>
              {offMap > 0 && (
                <p className="t-small c2 pf-off">{offMap} {offMap === 1 ? 'person' : 'people'} on this path {offMap === 1 ? 'isn’t' : 'aren’t'} in the current map view. <button className="link-btn" onClick={onShowAll}>Show everyone</button></p>
              )}
            </>
          ) : null}
        {result && <p className="t-micro c3 pf-method">{result.method} A path shows recorded relationships only — not influence.</p>}
      </div>
    </motion.section>
  )
}

// Tiny external store so only the hover card re-renders on pointer moves.
const hoverStore = (() => {
  let v: string | null = null
  const ls = new Set<() => void>()
  return {
    get: () => v,
    set: (id: string | null) => { if (id !== v) { v = id; ls.forEach(l => l()) } },
    sub: (l: () => void) => { ls.add(l); return () => { ls.delete(l) } },
  }
})()

function HoverCard({ byId, orgName }: { byId: Map<string, MapPerson>; orgName: Map<string, string> }) {
  const id = useSyncExternalStore(hoverStore.sub, hoverStore.get)
  const p = id ? byId.get(id) : null
  return (
    <AnimatePresence>
      {p && (
        <motion.div key="hc" className="hovercard" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
          <Avatar name={p.name} size={28} />
          <div className="grow">
            <div className="t-strong">{p.name}</div>
            <div className="t-small c2 truncate">{[p.title, orgName.get(p.orgId)].filter(Boolean).join(' · ')}</div>
          </div>
          <StanceBadge stance={p.stance} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
