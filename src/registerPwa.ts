import { registerSW } from 'virtual:pwa-register'

/** Intervalo de sondeo de una nueva versión (ms). */
const UPDATE_CHECK_MS = 5 * 60 * 1000

/**
 * PWA instalada: al publicar un build nuevo, el service worker se actualiza
 * solo (skipWaiting + reload) sin pedir confirmación al usuario.
 * Además se fuerza un check al volver a primer plano / recuperar red.
 */
export function registerPwa(): void {
  registerSW({
    immediate: true,
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
