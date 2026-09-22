/** Abrir visor de plano desde el globo (portal fuera de contexto React). */

export const SCADA_OPEN_DECK_PLAN_EVENT = 'scada-open-deck-plan'

export type OpenDeckPlanDetail = {
  local: string
  localName?: string
  equipmentId?: string
}

export function requestOpenDeckPlan(detail: OpenDeckPlanDetail): void {
  window.dispatchEvent(
    new CustomEvent(SCADA_OPEN_DECK_PLAN_EVENT, { detail }),
  )
}
