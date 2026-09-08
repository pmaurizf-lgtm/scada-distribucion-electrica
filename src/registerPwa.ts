import { registerSW } from 'virtual:pwa-register'

/** Intervalo de sondeo de una nueva versión (ms). */
const UPDATE_CHECK_MS = 5 * 60 * 1000

/** Flag de sesión: tras reload por SW, mostrar aviso breve. */
export const PWA_UPDATED_FLAG = 'scada-f110-pwa-just-updated'

/**
 * PWA: al publicar un build nuevo, el service worker (skipWaiting + clientsClaim)
 * toma el control y la página se recarga sola — al abrir la app, al volver a
 * primer plano o al recuperar red.
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
      window.location.reload()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        void registration.update().catch(() => {
          /* ignore: offline / SW ocupado */
        })
      }

      // Al abrir / registrar: comprobar ya (no esperar al intervalo).
      checkForUpdate()

      window.setInterval(checkForUpdate, UPDATE_CHECK_MS)

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })

      // iOS / PWA: volver desde segundo plano (bfcache o reactivación).
      window.addEventListener('pageshow', () => {
        checkForUpdate()
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
