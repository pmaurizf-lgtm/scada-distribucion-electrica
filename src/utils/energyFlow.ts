import type { Circuit, DistributionData, ProtectionStatusMap } from '../types'
import { allSectionCouplers, halfFromPanel } from './cascadeModel'

/**
 * Nodos y circuitos energizados desde generadores a través de interruptores
 * «cerrada». Enlaces virtuales de barra conducen, pero el cruce SA↔SB de un
 * MSB exige QBT1/QBT2 cerrado.
 */
export function computeEnergyFlow(
  data: DistributionData,
  protectionStatus: ProtectionStatusMap,
): {
  energizedEquipmentIds: Set<string>
  energizedCircuitIds: Set<string>
} {
  const gens = data.equipment.filter((e) => e.kind === 'generador')
  const energizedEquipmentIds = new Set<string>(gens.map((g) => g.id))
  const energizedCircuitIds = new Set<string>()
  const msbHalfSources = new Map<string, Set<'SA' | 'SB'>>()

  const byOrigin = new Map<string, Circuit[]>()
  const add = (c: Circuit) => {
    const list = byOrigin.get(c.originId) ?? []
    list.push(c)
    byOrigin.set(c.originId, list)
  }

  for (const c of data.circuits) add(c)
  for (const c of allSectionCouplers()) {
    add(c)
    add({ ...c, originId: c.destinationId, destinationId: c.originId })
  }

  const qbtIdForMsb = (msbId: string) =>
    msbId.endsWith('1') ? 'synth-QBT1' : 'synth-QBT2'

  const canReachPanelFromMsb = (msbId: string, destHalf: 'SA' | 'SB') => {
    const sources = msbHalfSources.get(msbId)
    if (!sources || sources.size === 0) return true
    if (sources.has(destHalf)) return true
    return protectionStatus[qbtIdForMsb(msbId)] === 'cerrada'
  }

  const queue = [...energizedEquipmentIds]
  while (queue.length > 0) {
    const node = queue.shift()!
    for (const circuit of byOrigin.get(node) ?? []) {
      const isQbt =
        circuit.protectionName === 'QBT1' || circuit.protectionName === 'QBT2'
      const statusId = isQbt
        ? circuit.protectionName === 'QBT1'
          ? 'synth-QBT1'
          : 'synth-QBT2'
        : circuit.id

      if (isQbt) {
        if (protectionStatus[statusId] !== 'cerrada') continue
        energizedCircuitIds.add(statusId)
        const msb =
          statusId === 'synth-QBT1' ? 'MSB-6PWS0001' : 'MSB-6PWS0002'
        msbHalfSources.set(msb, new Set(['SA', 'SB']))
      } else if (circuit.virtual) {
        if (
          circuit.originId.startsWith('MSB-6PWS') &&
          /^PNL-MSB/.test(circuit.destinationId)
        ) {
          const destHalf = halfFromPanel(circuit.destinationId)
          if (
            destHalf &&
            !canReachPanelFromMsb(circuit.originId, destHalf)
          ) {
            continue
          }
        }
        if (
          /^PNL-MSB/.test(circuit.originId) &&
          circuit.destinationId.startsWith('MSB-6PWS')
        ) {
          const srcHalf = halfFromPanel(circuit.originId)
          if (srcHalf) {
            const set = msbHalfSources.get(circuit.destinationId) ?? new Set()
            set.add(srcHalf)
            msbHalfSources.set(circuit.destinationId, set)
          }
        }
      } else if (protectionStatus[circuit.id] !== 'cerrada') {
        continue
      } else {
        energizedCircuitIds.add(circuit.id)
      }

      if (!energizedEquipmentIds.has(circuit.destinationId)) {
        energizedEquipmentIds.add(circuit.destinationId)
        queue.push(circuit.destinationId)
      }
    }
  }

  return { energizedEquipmentIds, energizedCircuitIds }
}

/** Invierte abierta ↔ cerrada en los circuitos indicados */
export function invertProtectionStatus(
  status: ProtectionStatusMap,
  circuitIds: string[],
): ProtectionStatusMap {
  const next: ProtectionStatusMap = { ...status }
  for (const id of circuitIds) {
    const cur = next[id] ?? 'abierta'
    next[id] = cur === 'abierta' ? 'cerrada' : 'abierta'
  }
  return next
}

export function toggleProtectionState(
  status: ProtectionStatusMap,
  circuitId: string,
): ProtectionStatusMap {
  const cur = status[circuitId] ?? 'abierta'
  return {
    ...status,
    [circuitId]: cur === 'abierta' ? 'cerrada' : 'abierta',
  }
}
