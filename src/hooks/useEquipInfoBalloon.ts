import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_HOVER_MS = 1800

function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/**
 * Globo de equipo: hover ~1,8 s en ratón; en táctil, un toque lo muestra/oculta
 * (el mouseleave del touchend no cancela el globo).
 */
export function useEquipInfoBalloon(delayMs = DEFAULT_HOVER_MS) {
  const [show, setShow] = useState(false)
  const timer = useRef<number | null>(null)
  const stickyTap = useRef(false)

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const onMouseEnter = useCallback(() => {
    if (stickyTap.current) return
    clearTimer()
    timer.current = window.setTimeout(() => setShow(true), delayMs)
  }, [clearTimer, delayMs])

  const onMouseLeave = useCallback(() => {
    if (stickyTap.current) return
    clearTimer()
    setShow(false)
  }, [clearTimer])

  const onClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      if (!isCoarsePointer()) return
      clearTimer()
      stickyTap.current = true
      setShow((prev) => {
        const next = !prev
        if (!next) stickyTap.current = false
        return next
      })
    },
    [clearTimer],
  )

  return { show, onMouseEnter, onMouseLeave, onClick }
}
