import { useEffect, useRef } from 'react'

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'

type Handler = (e: KeyboardEvent) => void | boolean

/**
 * Keyboard bindings. Keys: "k", "shift+x", "mod+k", sequences "g h".
 * Single-key bindings are ignored while typing; mod-bindings always fire.
 * Returning `false` from a handler lets the event continue (no preventDefault).
 */
export function useHotkeys(map: Record<string, Handler>, deps: unknown[] = [], enabled = true) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    if (!enabled) return
    let pending: string | null = null
    let timer = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const combo = `${mod ? 'mod+' : ''}${e.shiftKey && key.length > 1 ? 'shift+' : e.shiftKey ? 'shift+' : ''}${key}`
      if (!mod && isTyping(e)) return
      // While a modal (e.g. the command palette) is open, only it handles keys — except the mod combos that toggle it.
      const modal = document.querySelector('[aria-modal="true"]')
      if (modal && !modal.contains(e.target as Node) && !(mod && key === 'k')) return
      if (e.altKey) return
      const m = ref.current
      if (pending) {
        const seq = `${pending} ${key}`
        pending = null
        clearTimeout(timer)
        if (m[seq]) { if (m[seq](e) !== false) e.preventDefault(); return }
      }
      if (m[combo]) { if (m[combo](e) !== false) e.preventDefault(); return }
      if (!mod && !e.shiftKey && Object.keys(m).some(k => k.startsWith(key + ' '))) {
        pending = key
        timer = window.setTimeout(() => { pending = null }, 1000)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])
}
