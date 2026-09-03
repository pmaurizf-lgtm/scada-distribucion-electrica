import { registerSW } from 'virtual:pwa-register'

/** Intervalo de sondeo de una nueva versión (ms). */
const UPDATE_CHECK_MS = 5 * 60 * 1000

/** Flag de sesión: tras reload por SW, mostrar aviso breve en móvil. */
export const PWA_UPDATED_FLAG = 'scada-f110-pwa-just-updated'

/**
 * PWA instalada: al publicar un build nuevo, el service worker se actualiza
 * solo (skipWaiting + reload) sin pedir confirmación al usuario.
 * Además se fuerza un check al volver a primer plano / recuperar red.
 */
export function registerPwa(): void {
  registerSW({
    immediate: true,
    onNeedReload() {
      try {
        sessionStorage.setItem(PWA_UPDATED_FLAG, '1')
      } catch {
        /* ignore */
      }
      // No forzamos recargar: la UI muestra un toast y el usuario recarga cuando quiere.
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        void registration.update()
      }

      window.setInterval(checkForUpdate, UPDATE_CHECK_MS)

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })

      window.addEventListener('online', checkForUpdate)
    },
  })
}

/** Consume el flag de actualización (una sola vez por reload). */
export function consumePwaUpdatedFlag(): boolean {
  try {
    if (sessionStorage.getItem(PWA_UPDATED_FLAG) !== '1') return false
    sessionStorage.removeItem(PWA_UPDATED_FLAG)
    return true
  } catch {
    return false
  }
}
