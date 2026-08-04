import type { Circuit, DistributionData, Equipment } from '../types'

export type SheetView = 'resumen' | '1A' | '1B' | '2A' | '2B'

export const SHEET_VIEWS: { id: SheetView; label: string; hint: string }[] = [
  { id: 'resumen', label: 'Resumen', hint: 'Generadores y barras principales' },
  { id: '1A', label: '1A PROA SA', hint: 'Hoja cuadro proa · sección A' },
  { id: '1B', label: '1B PROA SB', hint: 'Hoja cuadro proa · sección B' },
  { id: '2A', label: '2A POPA SA', hint: 'Hoja cuadro popa · sección A' },
  { id: '2B', label: '2B POPA SB', hint: 'Hoja cuadro popa · sección B' },
]

export interface VisibleSlice {
  equipmentIds: Set<string>
  circuitIds: Set<string>
  /** Barra a la que “cuelgan” las salidas en esta vista */
  busId: string | null
}

export function feederSection(circuit: Circuit): SheetView | null {
  const raw = `${circuit.circuitRef ?? ''} ${circuit.protectionName ?? ''}`
  const m = raw.match(/Q([12])([AB])\d{1,2}/i)
  if (!m) return null
  return `${m[1]}${m[2].toUpperCase()}` as SheetView
}

export function isMsbFeeder(circuit: Circuit): boolean {
  if (circuit.virtual) return false
  if (!/^PNL-MSB/.test(circuit.originId)) return false
  if (/^PNL-MSB/.test(circuit.destinationId)) return false
  return feederSection(circuit) != null
}

export function sheetMeta(view: SheetView): {
  busId: string
  genId: string
  title: string
} | null {
  switch (view) {
    case '1A':
      return {
        busId: 'MSB-6PWS0001',
        genId: 'SDG-GENS0001',
        title: 'Cuadro principal PROA · 1SA',
      }
    case '1B':
      return {
        busId: 'MSB-6PWS0001',
        genId: 'SDG-GENS0002',
        title: 'Cuadro principal PROA · 1SB',
      }
    case '2A':
      return {
        busId: 'MSB-6PWS0002',
        genId: 'SDG-GENS0003',
        title: 'Cuadro principal POPA · 2SA',
      }
    case '2B':
      return {
        busId: 'MSB-6PWS0002',
        genId: 'SDG-GENS0004',
        title: 'Cuadro principal POPA · 2SB',
      }
    default:
      return null
  }
}

/**
 * Vista legible tipo hoja del PDF:
 * - resumen: 4 gens + 2 barras
 * - 1A/1B/2A/2B: 1 gen + 1 barra + salidas de 1er nivel (sin CCM internos)
 */
export function getVisibleSlice(
  data: DistributionData,
  view: SheetView,
): VisibleSlice {
  const equipmentIds = new Set<string>()
  const circuitIds = new Set<string>()

  const addEq = (id: string) => {
    if (data.equipment.some((e) => e.id === id)) equipmentIds.add(id)
  }

  if (view === 'resumen') {
    ;[
      'SDG-GENS0001',
      'SDG-GENS0002',
      'SDG-GENS0003',
      'SDG-GENS0004',
      'MSB-6PWS0001',
      'MSB-6PWS0002',
    ].forEach(addEq)

    for (const c of data.circuits) {
      if (!c.originId.startsWith('SDG-')) continue
      // Mostrar gen → barra como enlace lógico (vía id de circuito real gen→panel)
      circuitIds.add(c.id)
      addEq(c.originId)
      addEq(c.destinationId)
    }
    // Incluir paneles incomer solo para el enlace gen
    ;[
      'PNL-MSB1001A',
      'PNL-MSB1001B',
      'PNL-MSB2001A',
      'PNL-MSB2001B',
    ].forEach(addEq)
    for (const c of data.circuits) {
      if (
        c.virtual &&
        /^PNL-MSB(1001|2001)/.test(c.originId) &&
        c.destinationId.startsWith('MSB-6PWS')
      ) {
        circuitIds.add(c.id)
      }
    }

    return { equipmentIds, circuitIds, busId: null }
  }

  const meta = sheetMeta(view)!
  addEq(meta.genId)
  addEq(meta.busId)

  const feeders = data.circuits.filter(
    (c) => isMsbFeeder(c) && feederSection(c) === view,
  )
  for (const c of feeders) {
    circuitIds.add(c.id)
    addEq(c.destinationId)
  }

  // Enlace gen → barra: circuitos gen→panel + panel→barra
  for (const c of data.circuits) {
    if (c.originId === meta.genId) {
      circuitIds.add(c.id)
      addEq(c.destinationId)
    }
  }
  for (const c of data.circuits) {
    if (
      c.virtual &&
      c.destinationId === meta.busId &&
      equipmentIds.has(c.originId)
    ) {
      circuitIds.add(c.id)
    }
  }

  return { equipmentIds, circuitIds, busId: meta.busId }
}

export function countFeeders(data: DistributionData, view: SheetView): number {
  if (view === 'resumen') return 0
  return data.circuits.filter(
    (c) => isMsbFeeder(c) && feederSection(c) === view,
  ).length
}

export function listEquipment(
  data: DistributionData,
  ids: Set<string>,
): Equipment[] {
  return data.equipment.filter((e) => ids.has(e.id))
}
