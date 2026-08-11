import type { Equipment } from '../types'

/**
 * Segunda línea del letrero (cursiva):
 * - SSB con NME-674 → esa denominación (sustituye DCP-10, idéntico al PUMA).
 * - Resto → DCP-10 si existe.
 */
export function labelSecondaryDenom(
  equipment: Equipment,
): { value: string; title: string; kind: 'nme674' | 'dcp10' } | null {
  const nme = equipment.nme674Id?.trim()
  if (nme) {
    return {
      value: nme,
      title: 'Denominación NME-674',
      kind: 'nme674',
    }
  }
  const dcp = equipment.dcp10Id?.trim()
  if (!dcp) return null
  // SSB: PUMA ≡ DCP-10 → no duplicar si aún no hay NME
  if (equipment.id.startsWith('SSB-') && dcp === equipment.id) return null
  return {
    value: dcp,
    title: 'Denominación DCP-10',
    kind: 'dcp10',
  }
}
