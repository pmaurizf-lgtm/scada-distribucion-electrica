import type { Circuit, DistributionData, Equipment } from '../types'
import { boardFromOrigin, type BoardId } from './cascadeModel'

export interface UpstreamTrace {
  equipmentIds: string[]
  circuitIds: string[]
  circuits: Circuit[]
}

/** Barra LCS 440/230; otras tensiones (p. ej. 690) no aplican. */
export function normalizeLcsBusVoltage(
  voltage?: string | null,
): '440' | '230' | null {
  const v = (voltage ?? '').replace(/\s*V$/i, '').trim()
  if (v === '440' || v.startsWith('440')) return '440'
  if (v === '230' || v.startsWith('230')) return '230'
  return null
}

/**
 * Si se llega por un tramo 440/230, excluye la barra opuesta del mismo LCS
 * (p. ej. QVS-230 al subir desde un outlet 440). Conserva NORM/ALT de la
 * misma tensión y alimentaciones a otras tensiones (690, etc.).
 */
export function filterFeedsByBusVoltage(
  feeds: Circuit[],
  viaVoltage?: string | null,
): Circuit[] {
  const want = normalizeLcsBusVoltage(viaVoltage)
  if (!want) return feeds
  return feeds.filter((c) => {
    const v = normalizeLcsBusVoltage(c.voltage)
    if (v && v !== want) return false
    return true
  })
}

/**
 * Recorre alimentaciones aguas arriba desde un equipo
 * (destino ← origen ← … ← generadores), incluyendo rutas normales y alternativas.
 * Respeta continuidad de barra 440/230 en LCS duales.
 */
export function getUpstreamTrace(
  equipmentId: string,
  circuits: Circuit[],
): UpstreamTrace {
  const equipmentIds = new Set<string>([equipmentId])
  const circuitIds = new Set<string>()
  const foundCircuits: Circuit[] = []
  type QueueItem = { id: string; viaVoltage: string | null }
  const queue: QueueItem[] = [{ id: equipmentId, viaVoltage: null }]
  /** Clave id|barra para no reabrir el mismo nodo por la misma tensión. */
  const visited = new Set<string>([`${equipmentId}|`])

  while (queue.length > 0) {
    const { id: current, viaVoltage } = queue.shift()!
    const incoming = circuits.filter((c) => c.destinationId === current)
    const feeds = filterFeedsByBusVoltage(incoming, viaVoltage)
    for (const circuit of feeds) {
      if (circuitIds.has(circuit.id)) continue
      circuitIds.add(circuit.id)
      foundCircuits.push(circuit)
      equipmentIds.add(circuit.originId)
      const nextVia = circuit.voltage ?? viaVoltage
      const key = `${circuit.originId}|${normalizeLcsBusVoltage(nextVia) ?? ''}`
      if (!visited.has(key)) {
        visited.add(key)
        queue.push({ id: circuit.originId, viaVoltage: nextVia })
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

export interface PlantRevealPath {
  boardIds: BoardId[]
  /** Equipos a desplegar (ABT / TRF / LCS…) para que el destino sea visible. */
  expandEquipIds: string[]
}

/**
 * Calcula MSB y nodos a desplegar en la planta para revelar un equipo.
 */
export function getPlantRevealPath(
  equipmentId: string,
  data: DistributionData,
): PlantRevealPath {
  const boardIds = new Set<BoardId>()
  const expandEquipIds = new Set<string>()

  if (equipmentId === 'MSB-6PWS0001' || equipmentId === 'MSB-6PWS0002') {
    boardIds.add(equipmentId)
    return { boardIds: [...boardIds], expandEquipIds: [] }
  }

  const bDirect = boardFromOrigin(equipmentId)
  if (bDirect) boardIds.add(bDirect)

  const parentsOf = (id: string): string[] =>
    data.circuits
      .filter(
        (c) =>
          !c.virtual &&
          c.destinationId === id &&
          c.originId !== 'ORIGEN-PENDIENTE',
      )
      .map((c) => c.originId)

  const queue = [equipmentId]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const parent of parentsOf(id)) {
      const b = boardFromOrigin(parent)
      if (b) boardIds.add(b)
      if (parent === 'MSB-6PWS0001' || parent === 'MSB-6PWS0002') {
        boardIds.add(parent)
      }
      // Desplegar el padre si es un eslabón de cadena (el destino cuelga de él).
      if (/^(ABT|TRF|LCS)-/i.test(parent)) {
        expandEquipIds.add(parent)
      }
      queue.push(parent)
    }
  }

  // Si el objetivo es un LCS, desplegarlo también (vista dual).
  if (/^LCS-/i.test(equipmentId)) {
    expandEquipIds.add(equipmentId)
  }

  return {
    boardIds: [...boardIds],
    expandEquipIds: [...expandEquipIds],
  }
}

export type { Equipment }
