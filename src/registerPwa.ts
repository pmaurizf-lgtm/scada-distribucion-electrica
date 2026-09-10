import { registerSW } from 'virtual:pwa-register'

/** Intervalo de sondeo de una nueva versión (ms). */
const UPDATE_CHECK_MS = 5 * 60 * 1000

/** Flag de sesión: tras reload por SW, mostrar aviso breve. */
export const PWA_UPDATED_FLAG = 'scada-f110-pwa-just-updated'

const PWA_RELOADING = 'scada-f110-pwa-reloading'

/**
 * GitHub Pages cachea sw.js (max-age=600). fetch + cache: 'no-store'
 * antes de registration.update() evita que el HTTP cache sirva el SW viejo.
 */
async function pingSwScript(swUrl: string): Promise<boolean> {
  if (!navigator.onLine) return false
  const resp = await fetch(swUrl, {
    cache: 'no-store',
    headers: {
      cache: 'no-store',
      'cache-control': 'no-cache',
    },
  })
  return resp.ok
}

function markUpdatedAndReload() {
  try {
    sessionStorage.setItem(PWA_UPDATED_FLAG, '1')
    sessionStorage.setItem(PWA_RELOADING, '1')
  } catch {
    /* ignore */
  }
  window.location.reload()
}

/**
 * PWA: al publicar un build nuevo, el service worker (skipWaiting + clientsClaim)
 * toma el control y la página se recarga sola — al abrir la app, al volver a
 * primer plano o al recuperar red.
 *
 * En GitHub Pages el SW viejo sigue sirviendo index.html/JS cacheados: por eso
 * localhost (sin SW) muestra el globo y la web publicada no, hasta recargar
 * con la versión nueva.
 */
export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return

  let reloading = false
  let justReloaded = false
  try {
    justReloaded = sessionStorage.getItem(PWA_RELOADING) === '1'
    if (justReloaded) {
      // Evitar bucle: el SW puede volver a disparar controllerchange al reclamar.
      window.setTimeout(() => {
        try {
          sessionStorage.removeItem(PWA_RELOADING)
        } catch {
          /* ignore */
        }
      }, 2500)
    }
  } catch {
    /* ignore */
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedReload() {
      if (reloading || justReloaded) return
      reloading = true
      markUpdatedAndReload()
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        void (async () => {
          try {
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' })
              updateSW(true)
              return
            }
            const fresh = await pingSwScript(swUrl)
            if (fresh) await registration.update()
          } catch {
            /* ignore: offline / SW ocupado */
          }
        })()
      }

      checkForUpdate()
      window.setInterval(checkForUpdate, UPDATE_CHECK_MS)

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('pageshow', checkForUpdate)
      window.addEventListener('online', checkForUpdate)
    },
  })

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || justReloaded) return
    reloading = true
    markUpdatedAndReload()
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
