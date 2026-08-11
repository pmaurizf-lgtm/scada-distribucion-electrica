import type { Circuit, DistributionData, Equipment } from '../types'
import {
  boardFromOrigin,
  is24VCircuit,
  isAux24Feed,
  isMsb24Equipment,
  isPendingFeed,
  msb24SourceForAuxOrigin,
  type BoardId,
} from './cascadeModel'

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
 * 24 V: NORM completa; ALT/AUX tope en MSB-24PWxxxx.
 * 690 / 440 / 230 no se recortan.
 */
export function getUpstreamTrace(
  equipmentId: string,
  circuits: Circuit[],
): UpstreamTrace {
  const equipmentIds = new Set<string>([equipmentId])
  const circuitIds = new Set<string>()
  const foundCircuits: Circuit[] = []
  type QueueItem = {
    id: string
    viaVoltage: string | null
    capAtMsb24: boolean
    /** Nodo objetivo: aquí sí se contemplan acometidas AUX. */
    atTarget: boolean
  }
  const queue: QueueItem[] = [
    {
      id: equipmentId,
      viaVoltage: null,
      capAtMsb24: false,
      atTarget: true,
    },
  ]
  const visited = new Set<string>([`${equipmentId}||0`])

  const capsAtMsb24 = (circuit: Circuit) => {
    if (isAux24Feed(circuit)) return true
    if (!is24VCircuit(circuit)) return false
    return (
      circuit.lineType === 'alternativa' || isPendingFeed(circuit)
    )
  }

  while (queue.length > 0) {
    const { id: current, viaVoltage, capAtMsb24, atTarget } = queue.shift()!
    if (capAtMsb24 && isMsb24Equipment(current)) continue

    let incoming = circuits.filter((c) => c.destinationId === current)
    // En nodos intermedios no abrir AUX (evita contaminar potencia 24 V / LCS)
    if (!atTarget && !capAtMsb24) {
      incoming = incoming.filter((c) => !isAux24Feed(c))
    }
    const feeds = filterFeedsByBusVoltage(incoming, viaVoltage)
    for (const circuit of feeds) {
      if (circuitIds.has(circuit.id)) continue
      circuitIds.add(circuit.id)
      foundCircuits.push(circuit)

      const feedIsAux = isAux24Feed(circuit)
      const nextCap = capAtMsb24 || capsAtMsb24(circuit)
      let nextId = circuit.originId
      if (feedIsAux) {
        nextId = msb24SourceForAuxOrigin(
          { circuits, equipment: [] } as unknown as DistributionData,
          circuit.originId,
        )
      }
      equipmentIds.add(circuit.originId)
      equipmentIds.add(nextId)

      const nextVia = circuit.voltage ?? viaVoltage
      const key = `${nextId}|${normalizeLcsBusVoltage(nextVia) ?? ''}|${nextCap ? 1 : 0}`
      if (!visited.has(key)) {
        visited.add(key)
        queue.push({
          id: nextId,
          viaVoltage: nextVia,
          capAtMsb24: nextCap,
          atTarget: false,
        })
      }
    }
  }

  return {
    equipmentIds: [...equipmentIds],
    circuitIds: [...circuitIds],
    circuits: foundCircuits,
  }
}

/**
 * Busca equipo por código PUMA (`id`), DCP-10 (`dcp10Id`) o nombre.
 * Prioriza coincidencia exacta PUMA → DCP-10 → nombre.
 */
export function findEquipmentByQuery<
  T extends { id: string; name: string; dcp10Id?: string },
>(equipment: T[], query: string): T | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined

  const dcpOf = (e: T) => (e.dcp10Id ?? '').trim().toLowerCase()

  const exactId = equipment.find((e) => e.id.toLowerCase() === q)
  if (exactId) return exactId
  const exactDcp = equipment.find((e) => {
    const d = dcpOf(e)
    return d.length > 0 && d === q
  })
  if (exactDcp) return exactDcp
  const exactName = equipment.find((e) => e.name.toLowerCase() === q)
  if (exactName) return exactName

  // Consultas tipo código (con guión): PUMA / DCP-10 antes que nombre genérico
  if (q.includes('-')) {
    return (
      equipment.find((e) => e.id.toLowerCase().includes(q)) ??
      equipment.find((e) => {
        const d = dcpOf(e)
        return d.length > 0 && d.includes(q)
      }) ??
      equipment.find((e) => e.name.toLowerCase().includes(q))
    )
  }
  return (
    equipment.find((e) => e.name.toLowerCase().includes(q)) ??
    equipment.find((e) => e.id.toLowerCase().includes(q)) ??
    equipment.find((e) => {
      const d = dcpOf(e)
      return d.length > 0 && d.includes(q)
    })
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

  const isMsb24Tie = (originId: string, destId: string) =>
    /^MSB-24PW/i.test(originId) && /^MSB-24PW/i.test(destId)

  const isMsb4SfsTie = (originId: string, destId: string) =>
    /^MSB-4SFS/i.test(originId) &&
    /^MSB-4SFS/i.test(destId) &&
    originId !== destId

  /** Cadena desplegable aguas abajo del MSB 690 (incl. RCT / MSB-24 / 400 Hz). */
  const isExpandableLink = (id: string) =>
    /^(ABT|TRF|LCS|SSB|CCM|UPS|BUS|RCT|FAC|FCP|FUP|UCP|FAP|SCV|SBT|FIU)-/i.test(
      id,
    ) ||
    /^MSB-24PW/i.test(id) ||
    /^MSB-4SFS/i.test(id)

  /**
   * Padres de la cadena planta 690→ABT→TRF→LCS (evita el lazo 24 V
   * LCS↔SSB-24↔MSB-24↔RCT↔SSB-4PWS… que abría cuadros hermanos al localizar).
   * Incluye SBT/SCV/MSB-4SFS para revelar 400 Hz bajo el MSB 690.
   */
  const isPrimaryPlantParent = (id: string) =>
    /^(ABT|TRF|LCS|CCM|PNL-MSB|SBT|SCV)/i.test(id) ||
    /^MSB-6PWS/i.test(id) ||
    /^MSB-4SFS/i.test(id)

  const parentsOf = (id: string): string[] => {
    const incoming = data.circuits.filter(
      (c) =>
        !c.virtual &&
        c.destinationId === id &&
        c.originId !== 'ORIGEN-PENDIENTE' &&
        // No revelar subiendo acopladores MSB-24↔MSB-24 (ALT)
        !isMsb24Tie(c.originId, c.destinationId) &&
        // Ni acopladores entre MSB-4SFS (Q01/Q51)
        !isMsb4SfsTie(c.originId, c.destinationId),
    )
    // Preferir acometida normal (RCT→MSB, VS, …); si no hay, usar todas
    const norms = incoming.filter((c) => c.lineType === 'normal')
    const use = norms.length > 0 ? norms : incoming
    const ids = [...new Set(use.map((c) => c.originId))]
    const plant = ids.filter(isPrimaryPlantParent)
    // 400 Hz: subir por SCV, no por retorno TRF ni otras acometidas
    const scv = plant.filter((p) => /^SCV-4SFS/i.test(p))
    if (scv.length > 0) return scv
    // Si hay feeder de planta (p. ej. TRF→LCS), no subir también por SSB-24PW…
    return plant.length > 0 ? plant : ids
  }

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
      // Incluye SSB/CCM/RCT/MSB-24: sin ellos no se ve el tramo final.
      if (isExpandableLink(parent)) {
        expandEquipIds.add(parent)
      }
      queue.push(parent)
    }
  }

  // Si el objetivo es un cuadro desplegable, abrirlo también.
  if (isExpandableLink(equipmentId)) {
    expandEquipIds.add(equipmentId)
  }

  return {
    boardIds: [...boardIds],
    expandEquipIds: [...expandEquipIds],
  }
}

export type { Equipment }
