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

function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/** ¿El puntero sigue sobre el recuadro? (zoom/cables disparan mouseleave falso). */
function isPointerOverEquip(
  root: HTMLElement,
  x: number,
  y: number,
  target: EventTarget | null,
) {
  if (target instanceof Element && target.closest('.equip-balloon--portal')) {
    return true
  }
  if (target === root || (target instanceof Node && root.contains(target))) {
    return true
  }
  const r = root.getBoundingClientRect()
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
  const top = document.elementFromPoint(x, y)
  if (top instanceof Element) {
    const brk = top.closest('.casc-brk')
    if (brk && !root.contains(brk)) return false
  }
  return true
}

type EquipHoverWatch = {
  root: () => HTMLElement | null
  isSticky: () => boolean
  arm: () => void
  disarm: () => void
}

const watches = new Set<EquipHoverWatch>()
let docBound = false

function onDocumentPointerSample(e: MouseEvent) {
  for (const w of watches) {
    if (w.isSticky()) continue
    const root = w.root()
    if (!root) continue
    if (isPointerOverEquip(root, e.clientX, e.clientY, e.target)) w.arm()
    else w.disarm()
  }
}

function bindDocumentHover() {
  if (docBound || typeof window === 'undefined') return
  docBound = true
  window.addEventListener('mousemove', onDocumentPointerSample, {
    passive: true,
  })
  window.addEventListener('wheel', onDocumentPointerSample, { passive: true })
}

/**
 * Globo de equipo: misma regla que el de interruptor.
 * - Ratón/lápiz: ~1,8 s sobre el recuadro → globo anclado.
 *   No se cancela por mouseleave falso (zoom, cables).
 * - Táctil: pulsación larga (~1 s) → hoja; el doble toque sigue plegando.
 */
export function useEquipInfoBalloon(delayMs = DEFAULT_HOVER_MS) {
  const [show, setShow] = useState(false)
  const [sheet, setSheet] = useState(false)
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
    setSheet(false)
  }, [clearTimer, clearLongPress])

  const openSticky = useCallback(
    (asSheet: boolean) => {
      clearTimer()
      clearLongPress()
      sticky.current = true
      setSheet(asSheet)
      setShow(true)
      yieldCircuitBalloonToEquip()
      window.dispatchEvent(new CustomEvent('scada-canvas-interact'))
    },
    [clearTimer, clearLongPress],
  )

  const armHover = useCallback(() => {
    if (sticky.current) return
    if (timer.current != null) return
    timer.current = window.setTimeout(() => openSticky(false), delayMs)
  }, [delayMs, openSticky])

  const disarmHover = useCallback(() => {
    if (sticky.current) return
    clearTimer()
  }, [clearTimer])

  useEffect(() => {
    bindDocumentHover()
    const watch: EquipHoverWatch = {
      root: () => rootRef.current,
      isSticky: () => sticky.current,
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

  const onMouseEnter = useCallback(() => {
    armHover()
  }, [armHover])

  /** Zoom y cables disparan leave con el puntero aún encima: no cancelar. */
  const onMouseLeave = useCallback(
    (e: ReactMouseEvent) => {
      if (sticky.current) return
      const root = rootRef.current
      if (!root) return
      if (e.relatedTarget == null) return
      if (isPointerOverEquip(root, e.clientX, e.clientY, e.relatedTarget)) return
      disarmHover()
    },
    [disarmHover],
  )

  const onPointerEnter = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === 'touch') return
      armHover()
    },
    [armHover],
  )

  const onPointerLeave = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === 'touch') return
      if (sticky.current) return
      const root = rootRef.current
      if (!root) return
      if (e.relatedTarget == null) return
      if (isPointerOverEquip(root, e.clientX, e.clientY, e.relatedTarget)) return
      disarmHover()
    },
    [disarmHover],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') return
      if (e.button !== 0) return
      longPressFired.current = false
      pressOrigin.current = { x: e.clientX, y: e.clientY }
      clearLongPress()
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null
        longPressFired.current = true
        openSticky(true)
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

  const onClick = useCallback(
    (e: { stopPropagation?: () => void; preventDefault?: () => void }) => {
      if (!isCoarsePointer()) return
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
    onMouseEnter,
    onMouseLeave,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    onContextMenu,
  }

  return {
    show,
    sheet,
    onMouseEnter,
    onMouseLeave,
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
