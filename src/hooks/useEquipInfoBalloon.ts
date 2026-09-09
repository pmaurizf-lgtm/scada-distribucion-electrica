import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_HOVER_MS = 1800

function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/**
 * Globo de equipo: hover ~1,8 s → se fija hasta clic fuera / Escape.
 * En táctil, un toque muestra/oculta.
 * Así se puede pulsar «Notas» sin que desaparezca al mover el ratón.
 */
export function useEquipInfoBalloon(delayMs = DEFAULT_HOVER_MS) {
  const [show, setShow] = useState(false)
  const timer = useRef<number | null>(null)
  const sticky = useRef(false)
  const rootRef = useRef<HTMLElement | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearTimer()
    sticky.current = false
    setShow(false)
  }, [clearTimer])

  const openSticky = useCallback(() => {
    clearTimer()
    sticky.current = true
    setShow(true)
    window.dispatchEvent(new CustomEvent('scada-canvas-interact'))
  }, [clearTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

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
    if (sticky.current || show) return
    clearTimer()
    timer.current = window.setTimeout(() => openSticky(), delayMs)
  }, [clearTimer, delayMs, openSticky, show])

  const onMouseLeave = useCallback(() => {
    // Si aún no se abrió, cancelar el timer de apertura.
    // Si ya está abierto (sticky), no cerrar al salir del equipo.
    if (sticky.current || show) return
    clearTimer()
  }, [clearTimer, show])

  const onClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      // Solo táctil: en escritorio el globo se abre por hover ~1,8 s
      if (!isCoarsePointer()) return
      clearTimer()
      if (show) close()
      else openSticky()
    },
    [clearTimer, close, openSticky, show],
  )

  const setAnchorEl = useCallback((el: HTMLElement | null) => {
    rootRef.current = el
  }, [])

  return { show, onMouseEnter, onMouseLeave, onClick, setAnchorEl, close }
}
