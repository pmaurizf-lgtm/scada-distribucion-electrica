/** Abrir visor de plano desde el globo o el topbar. */

export const SCADA_OPEN_DECK_PLAN_EVENT = 'scada-open-deck-plan'

export type OpenDeckPlanDetail = {
  /** Si falta, modo consulta de planos (sin local concreto). */
  local?: string
  localName?: string
  equipmentId?: string
}

export function requestOpenDeckPlan(detail: OpenDeckPlanDetail = {}): void {
  window.dispatchEvent(
    new CustomEvent(SCADA_OPEN_DECK_PLAN_EVENT, { detail }),
  )
}
