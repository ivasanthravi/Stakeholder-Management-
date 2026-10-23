// Cytoscape stylesheet built from the CSS token palette so the canvas matches the DOM UI.
import type { StylesheetJson } from 'cytoscape'

export interface Palette {
  text1: string; text2: string; text3: string; surface: string; subtle: string; border: string; borderStrong: string
  accent: string; attention: string; critical: string
  stance: Record<string, string>
}

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    text1: v('--slate-900'), text2: v('--slate-600'), text3: v('--slate-500'),
    surface: '#FFFFFF', subtle: v('--slate-100'), border: v('--slate-200'), borderStrong: v('--slate-300'),
    accent: v('--teal-600'), attention: v('--amber-500'), critical: v('--red-600'),
    stance: {
      opposed: v('--stance-opposed'), concerned: v('--stance-concerned'), neutral: v('--stance-neutral'),
      supporter: v('--stance-supporter'), champion: v('--stance-champion'), unknown: v('--stance-unknown'),
    },
  }
}

const EASE = 'ease-out' as const

export function buildStyle(p: Palette): StylesheetJson {
  const stance = (ele: cytoscape.NodeSingular) => p.stance[ele.data('stance')] ?? p.stance.unknown
  return [
    {
      selector: 'node.person',
      style: {
        'width': (e: cytoscape.NodeSingular) => 12 + e.data('influence') * 6,
        'height': (e: cytoscape.NodeSingular) => 12 + e.data('influence') * 6,
        'background-color': stance,
        'background-opacity': 0.16,
        'border-width': 2.25,
        'border-color': stance,
        'label': 'data(label)',
        'font-family': 'Inter Variable, system-ui, sans-serif',
        'font-size': 10,
        'font-weight': 500,
        'color': p.text1,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-background-color': '#FFFFFF',
        'text-background-opacity': 0.85,
        'text-background-padding': '1.5px',
        'text-background-shape': 'roundrectangle',
        'min-zoomed-font-size': 8,
        'text-max-width': '90px',
        'text-wrap': 'ellipsis',
        'overlay-opacity': 0,
        'underlay-opacity': 0,
        'underlay-padding': 7,
        'underlay-shape': 'ellipse',
        'transition-property': 'opacity, border-width, underlay-opacity, background-opacity',
        'transition-duration': 140,
        'transition-timing-function': EASE,
      },
    },
    {
      selector: 'node.org',
      style: {
        'shape': 'round-rectangle',
        'corner-radius': '10',
        'background-color': p.subtle,
        'background-opacity': 0.55,
        'border-width': 1,
        'border-color': p.border,
        'label': 'data(label)',
        'font-family': 'JetBrains Mono Variable, ui-monospace, monospace',
        'font-size': 9.5,
        'font-weight': 500,
        'color': p.text3,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': 14,
        'padding': '16px',
        'min-zoomed-font-size': 7,
        'overlay-opacity': 0,
        'events': 'no',
        'transition-property': 'opacity',
        'transition-duration': 140,
      } as unknown as cytoscape.Css.Node,
    },
    {
      selector: 'node.quad',
      style: {
        'shape': 'rectangle', 'width': 436, 'height': 436,
        'background-color': p.subtle, 'background-opacity': 0.5,
        'border-width': 1, 'border-color': p.border,
        'label': 'data(label)', 'color': p.text3,
        'font-family': 'Inter Variable, system-ui, sans-serif', 'font-size': 13, 'font-weight': 550,
        'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': 22,
        'events': 'no', 'z-compound-depth': 'bottom', 'overlay-opacity': 0,
      } as unknown as cytoscape.Css.Node,
    },
    {
      selector: 'edge.rel',
      style: {
        'width': (e: cytoscape.EdgeSingular) => 0.5 + e.data('strength') * 0.55,
        'line-color': p.borderStrong,
        'curve-style': 'bezier',
        'opacity': 0.85,
        'overlay-opacity': 0,
        'font-family': 'Inter Variable, system-ui, sans-serif',
        'font-size': 9, 'font-weight': 500, 'color': p.text2,
        'text-background-color': '#FFFFFF', 'text-background-opacity': 1, 'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle',
        'text-rotation': 'autorotate',
        'min-zoomed-font-size': 8,
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 140,
        'transition-timing-function': EASE,
      },
    },
    { selector: 'edge.rel-reports-to', style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': p.borderStrong, 'arrow-scale': 0.6 } },
    { selector: 'edge.rel-colleague', style: { 'line-style': 'dotted', 'opacity': 0.6 } },
    { selector: 'edge.rel-influences', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 3], 'target-arrow-shape': 'vee', 'target-arrow-color': p.borderStrong, 'arrow-scale': 0.55 } },
    { selector: 'edge.rel-opposes', style: { 'line-color': p.stance.opposed, 'line-style': 'dashed', 'line-dash-pattern': [2, 2.5], 'opacity': 0.55 } },
    { selector: 'edge.rel-allied', style: { 'line-color': '#94BDB8' } },

    { selector: 'edge.gridhide', style: { 'opacity': 0 } },
    // ── States ───────────────────────────────────────────────────
    { selector: '.faded', style: { 'opacity': 0.13 } },
    { selector: 'node.leaving', style: { 'opacity': 0 } },
    { selector: 'edge.faded', style: { 'opacity': 0.05 } },
    { selector: 'edge.hl', style: { 'line-color': p.text2, 'target-arrow-color': p.text2, 'opacity': 1, 'label': 'data(label)', 'z-index': 10 } },
    { selector: 'edge.hl.rel-opposes', style: { 'line-color': p.stance.opposed } },
    { selector: 'edge.hl.rel-reports-to, edge.hl.rel-colleague', style: { 'label': '' } },
    { selector: 'node.org-dim', style: { 'background-opacity': 0.18, 'border-opacity': 0.35, 'text-opacity': 0.35 } },
    { selector: 'node.nb', style: { 'border-width': 2.5, 'z-index': 10 } },
    // Path finder: the chain stands out; unconfirmed (inferred) hops stay dashed so they never read as fact.
    { selector: 'node.path', style: { 'underlay-color': p.accent, 'underlay-opacity': 0.2, 'underlay-padding': 8, 'border-width': 3, 'z-index': 15, 'font-weight': 650 } },
    { selector: 'edge.path', style: { 'line-color': p.accent, 'target-arrow-color': p.accent, 'width': 3, 'opacity': 1, 'label': 'data(label)', 'z-index': 15 } },
    { selector: 'edge.path-inferred', style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 4], 'line-color': p.attention, 'target-arrow-color': p.attention } },
    { selector: 'node.match', style: { 'underlay-color': p.accent, 'underlay-opacity': 0.14 } },
    { selector: 'node.gapped', style: { 'underlay-color': p.attention, 'underlay-opacity': 0.22, 'underlay-padding': 9, 'border-style': 'double', 'border-width': 3.5 } },
    {
      selector: 'node.sel',
      style: {
        'underlay-color': p.accent, 'underlay-opacity': 0.18, 'underlay-padding': 9,
        'border-width': 3, 'z-index': 20, 'font-weight': 650, 'font-size': 11,
      },
    },
  ] as StylesheetJson
}
