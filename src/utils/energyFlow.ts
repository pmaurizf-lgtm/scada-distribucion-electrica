import type { Circuit, DistributionData, ProtectionStatusMap } from '../types'
import {
  allSectionCouplers,
  boardFromOrigin,
  halfFromPanel,
} from './cascadeModel'

const QT_NAMES = new Set(['QT1B', 'QT2A'])

function isBusTie(circuit: Circuit): boolean {
  return QT_NAMES.has(circuit.protectionName)
}

/**
 * Nodos y circuitos energizados desde generadores en marcha a través de
 * interruptores «cerrada». Sin generador arrancado no hay flujo.
 * - Cruce SA↔SB de un MSB: QBT1/QBT2 cerrado.
 * - Interconexión entre cuadros (1SB↔2SA): QT1B y QT2A cerrados (ambos).
 * - Aguas abajo: paneles energizados → salidas con interruptor cerrado.
 */
export function computeEnergyFlow(
  data: DistributionData,
  protectionStatus: ProtectionStatusMap,
  runningGeneratorIds: Set<string> = new Set(),
): {
  energizedEquipmentIds: Set<string>
  energizedCircuitIds: Set<string>
  energizedBusHalves: Map<string, Set<'SA' | 'SB'>>
} {
  const gens = data.equipment.filter(
    (e) => e.kind === 'generador' && runningGeneratorIds.has(e.id),
  )
  const energizedEquipmentIds = new Set<string>(gens.map((g) => g.id))
  const energizedCircuitIds = new Set<string>()
  const msbHalfSources = new Map<string, Set<'SA' | 'SB'>>()

  const qtByName = new Map<string, Circuit>()
  for (const c of data.circuits) {
    if (isBusTie(c)) qtByName.set(c.protectionName, c)
  }
  const qt1b = qtByName.get('QT1B')
  const qt2a = qtByName.get('QT2A')
  const busTieClosed =
    !!qt1b &&
    !!qt2a &&
    protectionStatus[qt1b.id] === 'cerrada' &&
    protectionStatus[qt2a.id] === 'cerrada'

  const queue: string[] = []
  const inQueue = new Set<string>()

  const enqueue = (id: string, force = false) => {
    if (!force && inQueue.has(id)) return
    inQueue.add(id)
    queue.push(id)
  }

  for (const id of energizedEquipmentIds) enqueue(id)

  const markPanelHalf = (panelId: string) => {
    const half = halfFromPanel(panelId)
    const board = boardFromOrigin(panelId)
    if (!half || !board) return
    const set = msbHalfSources.get(board) ?? new Set()
    const halfNew = !set.has(half)
    set.add(half)
    msbHalfSources.set(board, set)
    const boardNew = !energizedEquipmentIds.has(board)
    energizedEquipmentIds.add(board)
    if (boardNew || halfNew) enqueue(board, true)
  }

  const markBothHalves = (msbId: string) => {
    const prev = msbHalfSources.get(msbId)
    const alreadyBoth = !!(prev?.has('SA') && prev?.has('SB'))
    msbHalfSources.set(msbId, new Set(['SA', 'SB']))
    const boardNew = !energizedEquipmentIds.has(msbId)
    energizedEquipmentIds.add(msbId)
    if (boardNew || !alreadyBoth) enqueue(msbId, true)
  }

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
  for (const c of [qt1b, qt2a]) {
    if (!c) continue
    add({ ...c, originId: c.destinationId, destinationId: c.originId })
  }

  const qbtIdForMsb = (msbId: string) =>
    msbId.endsWith('1') ? 'synth-QBT1' : 'synth-QBT2'

  const canReachPanelFromMsb = (msbId: string, destHalf: 'SA' | 'SB') => {
    const sources = msbHalfSources.get(msbId)
    if (!sources || sources.size === 0) return false
    if (sources.has(destHalf)) return true
    return protectionStatus[qbtIdForMsb(msbId)] === 'cerrada'
  }

  /** Solo encola equipos recién energizados (evita bucles MSB↔panel virtual). */
  const reachDestination = (destId: string) => {
    if (energizedEquipmentIds.has(destId)) return
    energizedEquipmentIds.add(destId)
    enqueue(destId)
  }

  while (queue.length > 0) {
    const node = queue.shift()!
    inQueue.delete(node)

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
        const msb =
          statusId === 'synth-QBT1' ? 'MSB-6PWS0001' : 'MSB-6PWS0002'
        const sources = msbHalfSources.get(msb)
        if (!sources || sources.size === 0) continue
        energizedCircuitIds.add(statusId)
        markBothHalves(msb)
        reachDestination(circuit.destinationId)
        continue
      }

      if (isBusTie(circuit)) {
        if (!busTieClosed || !qt1b || !qt2a) continue
        energizedCircuitIds.add(qt1b.id)
        energizedCircuitIds.add(qt2a.id)
        markPanelHalf(circuit.destinationId)
        reachDestination(circuit.destinationId)
        continue
      }

      if (circuit.virtual) {
        if (
          circuit.originId.startsWith('MSB-6PWS') &&
          /^PNL-MSB/.test(circuit.destinationId)
        ) {
          const destHalf = halfFromPanel(circuit.destinationId)
          if (
            !destHalf ||
            !canReachPanelFromMsb(circuit.originId, destHalf)
          ) {
            continue
          }
          // Barra → panel: el panel queda vivo y podrá alimentar salidas
          reachDestination(circuit.destinationId)
          continue
        }
        if (
          /^PNL-MSB/.test(circuit.originId) &&
          circuit.destinationId.startsWith('MSB-6PWS')
        ) {
          markPanelHalf(circuit.originId)
          reachDestination(circuit.destinationId)
          continue
        }
        // Otros virtuales: propagar destino
        reachDestination(circuit.destinationId)
        continue
      }

      // Circuito real (QG, salidas, etc.): solo si el interruptor está cerrado
      if (protectionStatus[circuit.id] !== 'cerrada') continue

      // LCS: salidas VM/NV requieren QVM/QNV cerrado (como QBT entre mitades MSB)
      if (
        circuit.originId.startsWith('LCS-') &&
        (circuit.service === 'VM' || circuit.service === 'NV') &&
        !/^QVM-|^QNV-/.test(circuit.protectionName)
      ) {
        const v = (circuit.voltage ?? '').replace(/\s*V$/i, '')
        const needName =
          circuit.service === 'VM' ? `QVM-${v}` : `QNV-${v}`
        const coupler = (byOrigin.get(circuit.originId) ?? []).find(
          (c) => c.protectionName === needName,
        )
        if (coupler && protectionStatus[coupler.id] !== 'cerrada') continue
      }

      energizedCircuitIds.add(circuit.id)
      if (/^PNL-MSB/.test(circuit.destinationId)) {
        markPanelHalf(circuit.destinationId)
      }
      if (/^PNL-MSB/.test(circuit.originId)) {
        markPanelHalf(circuit.originId)
      }
      reachDestination(circuit.destinationId)
    }
  }

  return {
    energizedEquipmentIds,
    energizedCircuitIds,
    energizedBusHalves: msbHalfSources,
  }
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
