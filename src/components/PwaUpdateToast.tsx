import { useEffect, useState } from 'react'
import { consumePwaUpdatedFlag } from '../registerPwa'

const TOAST_MS = 2800

/**
 * Aviso breve en móvil tras un reload por actualización automática de la PWA.
 */
export function PwaUpdateToast({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!enabled) return
    if (!consumePwaUpdatedFlag()) return
    setVisible(true)
    const t = window.setTimeout(() => setVisible(false), TOAST_MS)
    return () => window.clearTimeout(t)
  }, [enabled])

  if (!visible) return null

  return (
    <div className="pwa-update-toast" role="status" aria-live="polite">
      App actualizada
    </div>
  )
}
