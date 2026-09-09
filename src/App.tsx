import { useState } from 'react'
import { ScadaCanvas } from './components/ScadaCanvas'
import './App.css'
import './mobile.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { VesselGate } from './vessels/VesselGate'
import type { VesselId } from './vessels/vesselCatalog'

export default function App() {
  /** Sesión: null hasta elegir buque (obligatorio en cada apertura). */
  const [activeVessel, setActiveVessel] = useState<VesselId | null>(null)

  return (
    <ErrorBoundary>
      {activeVessel == null ? (
        <VesselGate onSelect={setActiveVessel} />
      ) : (
        <ScadaCanvas
          vesselId={activeVessel}
          onVesselChange={setActiveVessel}
        />
      )}
    </ErrorBoundary>
  )
}
