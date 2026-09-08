import { useEffect, useState } from 'react'
import { consumePwaUpdatedFlag } from '../registerPwa'

const TOAST_MS = 4500

/**
 * Aviso breve tras un reload automático por nueva versión de la PWA.
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
      Versión actualizada
    </div>
  )
}
