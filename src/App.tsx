import { ScadaCanvas } from './components/ScadaCanvas'
import './App.css'
import './mobile.css'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <ScadaCanvas />
    </ErrorBoundary>
  )
}
