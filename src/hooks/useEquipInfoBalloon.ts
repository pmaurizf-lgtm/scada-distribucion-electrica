import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'

const DEFAULT_HOVER_MS = 1800
/** Pulsación larga en táctil para abrir el globo (no interferir con doble toque). */
const LONG_PRESS_MS = 1000
const LONG_PRESS_MOVE_PX = 10

/** El hover de un interruptor cancela el globo de equipo (no pelear en chasis/tarjeta). */
export const SCADA_BREAKER_HOVER = 'scada-breaker-hover'
/** Al abrir el globo de equipo, cierra el de interruptor. */
export const SCADA_EQUIP_BALLOON_OPEN = 'scada-equip-balloon-open'

export function yieldEquipBalloonToBreaker() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SCADA_BREAKER_HOVER))
}

export function yieldCircuitBalloonToEquip() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SCADA_EQUIP_BALLOON_OPEN))
}

function isBreakerHoverTarget(t: EventTarget | null) {
  return t instanceof Element && Boolean(t.closest('.casc-brk'))
}

function canHoverWithPointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover)').matches
  )
}

function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

type EquipHoverWatch = {
  root: () => HTMLElement | null
  arm: () => void
  disarm: () => void
}

const watches = new Set<EquipHoverWatch>()
let docHoverBound = false

function onDocumentHoverMove(e: MouseEvent) {
  if (!canHoverWithPointer()) return
  const top = e.target
  for (const w of watches) {
    const root = w.root()
    if (!root) continue
    if (top instanceof Node && root.contains(top) && !isBreakerHoverTarget(top)) {
      w.arm()
    } else {
      w.disarm()
    }
  }
}

function bindDocumentHover() {
  if (docHoverBound || typeof window === 'undefined') return
  docHoverBound = true
  window.addEventListener('mousemove', onDocumentHoverMove, { passive: true })
}

/**
 * Globo de equipo:
 * - Escritorio: hover ~1,8 s → se fija hasta clic fuera / Escape.
 * - Táctil: pulsación larga (~1 s) → globo; doble toque libre para plegar/desplegar.
 */
export function useEquipInfoBalloon(delayMs = DEFAULT_HOVER_MS) {
  const [show, setShow] = useState(false)
  const timer = useRef<number | null>(null)
  const sticky = useRef(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const longPressFired = useRef(false)

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    pressOrigin.current = null
  }, [])

  const close = useCallback(() => {
    clearTimer()
    clearLongPress()
    sticky.current = false
    setShow(false)
  }, [clearTimer, clearLongPress])

  const openSticky = useCallback(() => {
    clearTimer()
    clearLongPress()
    sticky.current = true
    setShow(true)
    yieldCircuitBalloonToEquip()
    window.dispatchEvent(new CustomEvent('scada-canvas-interact'))
  }, [clearTimer, clearLongPress])

  const armHover = useCallback(() => {
    if (sticky.current) return
    if (timer.current != null) return
    timer.current = window.setTimeout(() => openSticky(), delayMs)
  }, [delayMs, openSticky])

  const disarmHover = useCallback(() => {
    if (sticky.current) return
    clearTimer()
  }, [clearTimer])

  useEffect(() => {
    bindDocumentHover()
    const watch: EquipHoverWatch = {
      root: () => rootRef.current,
      arm: armHover,
      disarm: disarmHover,
    }
    watches.add(watch)
    return () => {
      watches.delete(watch)
      clearTimer()
      clearLongPress()
    }
  }, [armHover, disarmHover, clearTimer, clearLongPress])

  useEffect(() => {
    const onBreakerHover = () => {
      clearTimer()
      if (sticky.current) close()
    }
    window.addEventListener(SCADA_BREAKER_HOVER, onBreakerHover)
    return () => window.removeEventListener(SCADA_BREAKER_HOVER, onBreakerHover)
  }, [clearTimer, close])

  useEffect(() => {
    if (!show) return

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.equip-balloon--portal')) return
      if (t.closest('.notes-modal-backdrop') || t.closest('.notes-modal')) return
      if (rootRef.current && rootRef.current.contains(t)) return
      close()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [show, close])

  const onMouseOver = useCallback(
    (e: ReactMouseEvent) => {
      if (!canHoverWithPointer()) return
      if (isBreakerHoverTarget(e.target)) {
        disarmHover()
        return
      }
      armHover()
    },
    [armHover, disarmHover],
  )

  const onMouseOut = useCallback(
    (e: ReactMouseEvent) => {
      if (!canHoverWithPointer()) return
      const related = e.relatedTarget
      if (related instanceof Node && e.currentTarget.contains(related)) {
        return
      }
      disarmHover()
    },
    [disarmHover],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!isCoarsePointer()) return
      if (e.pointerType === 'mouse') return
      if (e.button !== 0) return
      longPressFired.current = false
      pressOrigin.current = { x: e.clientX, y: e.clientY }
      clearLongPress()
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null
        longPressFired.current = true
        openSticky()
        // Evita el menú contextual del sistema tras la pulsación larga.
        try {
          if (navigator.vibrate) navigator.vibrate(12)
        } catch {
          /* ignore */
        }
      }, LONG_PRESS_MS)
    },
    [clearLongPress, openSticky],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!pressOrigin.current || longPressTimer.current == null) return
      const dx = e.clientX - pressOrigin.current.x
      const dy = e.clientY - pressOrigin.current.y
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_PX) {
        clearLongPress()
      }
    },
    [clearLongPress],
  )

  const onPointerUp = useCallback(() => {
    clearLongPress()
  }, [clearLongPress])

  const onPointerCancel = useCallback(() => {
    clearLongPress()
  }, [clearLongPress])

  /** En táctil no abre/cierra el globo: eso va por pulsación larga. */
  const onClick = useCallback(
    (e: { stopPropagation?: () => void; preventDefault?: () => void }) => {
      if (!isCoarsePointer()) return
      // Si acabamos de abrir por long-press, no dejes que el click haga otra cosa rara.
      if (longPressFired.current) {
        e.preventDefault?.()
        e.stopPropagation?.()
        longPressFired.current = false
      }
    },
    [],
  )

  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    if (isCoarsePointer()) e.preventDefault()
  }, [])

  const setAnchorEl = useCallback((el: HTMLElement | null) => {
    rootRef.current = el
  }, [])

  const bind = {
    onMouseOver,
    onMouseOut,
    onMouseEnter: onMouseOver,
    onMouseLeave: onMouseOut,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    onContextMenu,
  }

  return {
    show,
    onMouseEnter: onMouseOver,
    onMouseLeave: onMouseOut,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    bind,
    setAnchorEl,
    close,
  }
}
