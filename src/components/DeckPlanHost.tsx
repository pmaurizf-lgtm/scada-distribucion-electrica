import { useEffect, useState } from 'react'
import { DeckPlanViewer } from './DeckPlanViewer'
import {
  SCADA_OPEN_DECK_PLAN_EVENT,
  type OpenDeckPlanDetail,
} from '../deckPlans'
import { useDeckPlanOverridesSync } from '../deckPlans/useDeckPlanOverridesSync'

/** Escucha el evento global y monta el visor de plano. */
export function DeckPlanHost() {
  const [open, setOpen] = useState<OpenDeckPlanDetail | null>(null)
  useDeckPlanOverridesSync()

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<OpenDeckPlanDetail>
      if (ce.detail?.local) setOpen(ce.detail)
    }
    window.addEventListener(SCADA_OPEN_DECK_PLAN_EVENT, onOpen)
    return () => window.removeEventListener(SCADA_OPEN_DECK_PLAN_EVENT, onOpen)
  }, [])

  if (!open) return null
  return (
    <DeckPlanViewer
      local={open.local}
      localName={open.localName}
      equipmentId={open.equipmentId}
      onClose={() => setOpen(null)}
    />
  )
}
