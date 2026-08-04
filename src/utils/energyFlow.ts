import type { Circuit, DistributionData, ProtectionStatusMap } from '../types'

/**
 * Nodos y circuitos energizados: desde generadores, solo a través
 * de interruptores en estado «cerrada». Los enlaces virtuales de barra
 * se consideran siempre conductores (sin interruptor físico).
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

  const byOrigin = new Map<string, Circuit[]>()
  for (const c of data.circuits) {
    const list = byOrigin.get(c.originId) ?? []
    list.push(c)
    byOrigin.set(c.originId, list)
  }

  const queue = [...energizedEquipmentIds]
  while (queue.length > 0) {
    const node = queue.shift()!
    for (const circuit of byOrigin.get(node) ?? []) {
      const closed =
        circuit.virtual || protectionStatus[circuit.id] === 'cerrada'
      if (!closed) continue
      if (energizedCircuitIds.has(circuit.id)) continue
      // Solo marcar flujo visual en circuitos reales
      if (!circuit.virtual) energizedCircuitIds.add(circuit.id)
      if (!energizedEquipmentIds.has(circuit.destinationId)) {
        energizedEquipmentIds.add(circuit.destinationId)
        queue.push(circuit.destinationId)
      }
    }
  }

  return { energizedEquipmentIds, energizedCircuitIds }
}

/** Invierte abierta ↔ cerrada en todos los circuitos conocidos */
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
