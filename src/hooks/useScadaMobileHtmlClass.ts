/** Marca <html> para estilos de portales (modales/globos fuera de .app-shell). */
import { useEffect } from 'react'
import { useIsMobileUi } from './useIsMobileUi'

export function useScadaMobileHtmlClass(): boolean {
  const mobile = useIsMobileUi()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('scada-mobile', mobile)
    return () => {
      root.classList.remove('scada-mobile')
    }
  }, [mobile])

  return mobile
}
