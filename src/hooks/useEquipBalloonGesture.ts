import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useIsMobileUi } from './useIsMobileUi'

/** Escritorio: hover sostenido (mismo criterio que interruptores). */
const HOVER_DELAY_MS = 1800
/** Móvil: pulsación larga para el globo de equipo. */
const LONG_PRESS_MS = 480
const MOVE_CANCEL_PX = 12

export type EquipBalloonBind = {
  'data-equip-balloon-anchor': string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onTouchStart?: (e: ReactTouchEvent) => void
  onTouchMove?: (e: ReactTouchEvent) => void
  onTouchEnd?: () => void
  onTouchCancel?: () => void
  onContextMenu?: (e: ReactMouseEvent) => void
}

/**
 * Globo de equipo:
 * - Escritorio: hover ~1,8 s
 * - Móvil: solo pulsación larga (sin hover sticky)
 */
export function useEquipBalloonGesture() {
  const isMobile = useIsMobileUi()
  const [hoverArmed, setHoverArmed] = useState(false)
  const [showBalloon, setShowBalloon] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const startXY = useRef<{ x: number; y: number } | null>(null)

  const clearPress = useCallback(() => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }, [])

  const dismissBalloon = useCallback(() => {
    clearPress()
    setHoverArmed(false)
    setShowBalloon(false)
  }, [clearPress])

  useEffect(() => {
    if (isMobile) return
    if (!hoverArmed) {
      setShowBalloon(false)
      return
    }
    const t = window.setTimeout(() => setShowBalloon(true), HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [hoverArmed, isMobile])

  useEffect(() => () => clearPress(), [clearPress])

  const balloonBind: EquipBalloonBind = isMobile
    ? {
        'data-equip-balloon-anchor': '1',
        onTouchStart: (e) => {
          if (e.touches.length !== 1) {
            clearPress()
            return
          }
          const t = e.touches[0]
          startXY.current = { x: t.clientX, y: t.clientY }
          clearPress()
          pressTimer.current = window.setTimeout(() => {
            setShowBalloon(true)
            try {
              navigator.vibrate?.(12)
            } catch {
              /* ignore */
            }
          }, LONG_PRESS_MS)
        },
        onTouchMove: (e) => {
          if (!startXY.current || e.touches.length !== 1) return
          const t = e.touches[0]
          if (
            Math.hypot(
              t.clientX - startXY.current.x,
              t.clientY - startXY.current.y,
            ) > MOVE_CANCEL_PX
          ) {
            clearPress()
            startXY.current = null
          }
        },
        onTouchEnd: () => {
          clearPress()
          startXY.current = null
        },
        onTouchCancel: () => {
          clearPress()
          startXY.current = null
        },
        onContextMenu: (e) => {
          e.preventDefault()
        },
      }
    : {
        'data-equip-balloon-anchor': '1',
        onMouseEnter: () => setHoverArmed(true),
        onMouseLeave: () => {
          setHoverArmed(false)
          setShowBalloon(false)
        },
      }

  return {
    isMobile,
    showBalloon,
    dismissBalloon,
    balloonBind,
    /** Texto corto para hints UI */
    expandHint: isMobile ? 'doble pulsación' : 'doble clic',
    infoHint: isMobile ? 'mantener pulsado · info' : 'hover ~2 s · info',
  }
}
