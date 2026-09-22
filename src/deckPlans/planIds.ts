/** IDs de plano antiguos (hoja NNN) → ids con nombre legible. */
export const LEGACY_PLAN_IDS: Record<string, string> = {
  '000': 'cubierta-principal',
  '001': 'cubierta-2',
  '003': 'cubierta-3',
  '004': 'cubierta-4',
  '005': 'tanques',
  '006': 'cubierta-01',
  '007': 'cubierta-02',
  '008': 'cubiertas-03-07',
  '009': 'cubierta-08',
}

export function migratePlanId(planId: string): string {
  return LEGACY_PLAN_IDS[planId] ?? planId
}

export function migrateHitPlanIds<T extends { planId: string }>(hit: T): T {
  return { ...hit, planId: migratePlanId(hit.planId) }
}
