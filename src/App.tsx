import { useEffect, useState } from 'react'
import { ScadaCanvas } from './components/ScadaCanvas'
import './App.css'
import './mobile.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { VesselGate } from './vessels/VesselGate'
import type { VesselId } from './vessels/vesselCatalog'
import { NotesProvider, UserProfileProvider, useUserProfile } from './notes'
import { UserProfileModal } from './components/UserProfileModal'
import { hasDisplayName } from './notes/userProfile'
import { useScadaMobileHtmlClass } from './hooks/useScadaMobileHtmlClass'

function AppShell({
  vesselId,
  onVesselChange,
}: {
  vesselId: VesselId
  onVesselChange: (id: VesselId) => void
}) {
  const { openProfilePrompt, profile } = useUserProfile()
  const needsName = !profile && !hasDisplayName()
  useScadaMobileHtmlClass()

  useEffect(() => {
    if (needsName) {
      openProfilePrompt(
        'Indica tu nombre para firmar las notas de revisión a bordo.',
      )
    }
  }, [needsName, openProfilePrompt])

  return (
    <NotesProvider vesselId={vesselId}>
      <ScadaCanvas vesselId={vesselId} onVesselChange={onVesselChange} />
      <UserProfileModal required={needsName} />
    </NotesProvider>
  )
}

function VesselGateScreen({
  onSelect,
}: {
  onSelect: (id: VesselId) => void
}) {
  useScadaMobileHtmlClass()
  return <VesselGate onSelect={onSelect} />
}

export default function App() {
  /** Sesión: null hasta elegir buque (obligatorio en cada apertura). */
  const [activeVessel, setActiveVessel] = useState<VesselId | null>(null)

  return (
    <ErrorBoundary>
      <UserProfileProvider>
        {activeVessel == null ? (
          <VesselGateScreen onSelect={setActiveVessel} />
        ) : (
          <AppShell
            vesselId={activeVessel}
            onVesselChange={setActiveVessel}
          />
        )}
      </UserProfileProvider>
    </ErrorBoundary>
  )
}
