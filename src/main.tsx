import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

/**
 * PWA: con red, busca versiones nuevas y las aplica sola (registerType autoUpdate).
 * - Al abrir / recuperar foco / volver online
 * - Cada hora mientras la app sigue abierta
 */
const UPDATE_CHECK_MS = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    const check = () => {
      if (navigator.onLine) void registration.update()
    }

    window.setInterval(check, UPDATE_CHECK_MS)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    window.addEventListener('focus', check)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
