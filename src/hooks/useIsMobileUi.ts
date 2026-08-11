/** Detección de viewport / puntero táctil (misma app desktop+móvil). */
import { useEffect, useState } from 'react'

const MQ_NARROW = '(max-width: 900px)'
const MQ_COARSE = '(pointer: coarse)'

export function useIsMobileUi(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia(MQ_NARROW).matches ||
      window.matchMedia(MQ_COARSE).matches
    )
  })

  useEffect(() => {
    const narrow = window.matchMedia(MQ_NARROW)
    const coarse = window.matchMedia(MQ_COARSE)
    const sync = () =>
      setMobile(narrow.matches || coarse.matches)
    sync()
    narrow.addEventListener('change', sync)
    coarse.addEventListener('change', sync)
    return () => {
      narrow.removeEventListener('change', sync)
      coarse.removeEventListener('change', sync)
    }
  }, [])

  return mobile
}
