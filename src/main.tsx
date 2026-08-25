import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerPwa } from './registerPwa'
import './index.css'

registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
