import { useEffect, useState } from 'react'
import { consumePwaUpdatedFlag } from '../registerPwa'

const TOAST_MS = 6000

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
      <div style={{ marginBottom: 8 }}>Nueva versión disponible.</div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          borderRadius: 8,
          border: '1px solid #2c3f39',
          background: '#15201c',
          color: '#e4ebe8',
          padding: '8px 12px',
          cursor: 'pointer',
        }}
      >
        Recargar
      </button>
    </div>
  )
}
