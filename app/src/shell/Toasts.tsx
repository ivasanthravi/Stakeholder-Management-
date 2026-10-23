import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useApp } from './context'
import { Button, Kbd } from '../components/ui'
import { useHotkeys, MOD } from '../lib/hotkeys'
import { t } from '../lib/motion'

export function Toasts() {
  const { toasts, dismissToast, toast } = useApp()
  const last = toasts[toasts.length - 1]

  useHotkeys({
    'mod+z': () => {
      if (!last?.undo) return false
      last.undo(); dismissToast(last.id); toast('Undone')
    },
  }, [last])

  return (
    <div className="toasts" aria-live="off">
      <AnimatePresence initial={false}>
        {toasts.map(tt => <ToastItem key={tt.id} id={tt.id} message={tt.message} undo={tt.undo} tone={tt.tone} onDone={() => dismissToast(tt.id)} />)}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ message, undo, tone, onDone }: { id: number; message: string; undo?: () => void; tone?: 'default' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const h = window.setTimeout(onDone, undo || tone === 'error' ? 6000 : 3200)
    return () => clearTimeout(h)
  }, [onDone, undo])
  return (
    <motion.div
      layout
      className="toast"
      data-tone={tone}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: t.base }}
      exit={{ opacity: 0, scale: 0.98, transition: t.exit }}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      {undo && <Button size="sm" variant="ghost" onClick={() => { undo(); onDone() }}>Undo <Kbd>{MOD}Z</Kbd></Button>}
    </motion.div>
  )
}
