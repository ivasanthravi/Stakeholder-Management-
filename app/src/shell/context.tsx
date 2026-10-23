import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface Toast { id: number; message: string; undo?: () => void; tone?: 'default' | 'error' }
export type CreateKind = 'stakeholder' | 'organization' | 'initiative' | 'engagement' | 'decision' | 'commitment'
export interface CreateRequest { kind: CreateKind; defaults?: Record<string, unknown>; onCreated?: (rec: { id: string }) => void }

interface AppCtx {
  toast: (message: string, undo?: () => void, tone?: 'default' | 'error') => void
  toasts: Toast[]
  dismissToast: (id: number) => void
  paletteOpen: boolean
  openPalette: (query?: string) => void
  closePalette: () => void
  paletteSeed: string
  paletteNonce: number
  peekId: string | null
  setPeek: (id: string | null) => void
  announce: (msg: string) => void
  liveMessage: string
  create: CreateRequest | null
  openCreate: (kind: CreateKind, defaults?: Record<string, unknown>, onCreated?: (rec: { id: string }) => void) => void
  closeCreate: () => void
}

const Ctx = createContext<AppCtx>(null!)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteSeed, setSeed] = useState('')
  const [paletteNonce, setNonce] = useState(0)
  const [peekId, setPeek] = useState<string | null>(null)
  const [liveMessage, setLive] = useState('')
  const [create, setCreate] = useState<CreateRequest | null>(null)
  const n = useRef(0)

  const dismissToast = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), [])
  const toast = useCallback((message: string, undo?: () => void, tone: 'default' | 'error' = 'default') => {
    const id = ++n.current
    setToasts(ts => [...ts.slice(-2), { id, message, undo, tone }])
    setLive(message)
  }, [])
  const openPalette = useCallback((q = '') => { setSeed(q); setNonce(n => n + 1); setPaletteOpen(true) }, [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const announce = useCallback((m: string) => setLive(m), [])
  const openCreate = useCallback((kind: CreateKind, defaults?: Record<string, unknown>, onCreated?: (rec: { id: string }) => void) => setCreate({ kind, defaults, onCreated }), [])
  const closeCreate = useCallback(() => setCreate(null), [])

  const value = useMemo(() => ({
    toast, toasts, dismissToast, paletteOpen, openPalette, closePalette, paletteSeed, paletteNonce, peekId, setPeek, announce, liveMessage, create, openCreate, closeCreate,
  }), [toast, toasts, dismissToast, paletteOpen, openPalette, closePalette, paletteSeed, paletteNonce, peekId, announce, liveMessage, create, openCreate, closeCreate])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
