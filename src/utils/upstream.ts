import type { Circuit } from '../types'

export interface UpstreamTrace {
  equipmentIds: string[]
  circuitIds: string[]
  circuits: Circuit[]
}

/**
 * Recorre todas las alimentaciones aguas arriba desde un equipo
 * (destino ← origen ← … ← generadores), incluyendo rutas normales y alternativas.
 */
export function getUpstreamTrace(
  equipmentId: string,
  circuits: Circuit[],
): UpstreamTrace {
  const equipmentIds = new Set<string>([equipmentId])
  const circuitIds = new Set<string>()
  const foundCircuits: Circuit[] = []
  const queue = [equipmentId]
  const visited = new Set<string>([equipmentId])

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const circuit of circuits) {
      if (circuit.destinationId !== current) continue
      if (circuitIds.has(circuit.id)) continue
      circuitIds.add(circuit.id)
      foundCircuits.push(circuit)
      equipmentIds.add(circuit.originId)
      if (!visited.has(circuit.originId)) {
        visited.add(circuit.originId)
        queue.push(circuit.originId)
      }
    }
  }

  return {
    equipmentIds: [...equipmentIds],
    circuitIds: [...circuitIds],
    circuits: foundCircuits,
  }
}

export function findEquipmentByQuery<T extends { id: string; name: string }>(
  equipment: T[],
  query: string,
): T | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return (
    equipment.find((e) => e.id.toLowerCase() === q) ??
    equipment.find((e) => e.name.toLowerCase() === q) ??
    equipment.find((e) => e.name.toLowerCase().includes(q)) ??
    equipment.find((e) => e.id.toLowerCase().includes(q))
  )
}
