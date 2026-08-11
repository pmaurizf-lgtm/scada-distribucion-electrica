import type { Circuit, DistributionData, ProtectionStatusMap } from '../types'
import { isSsbIncomingCircuit } from '../abtDownstream/ssbBoard'
import {
  allSectionCouplers,
  boardFromOrigin,
  halfFromPanel,
  isAux24Feed,
  isLinkOnlyOutgoingFeed,
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

  const isClosed = (circuitId: string) =>
    protectionStatus[circuitId] === 'cerrada'

  /**
   * Clones del mismo interruptor lógico (mismo origen/destino/nombre).
   * Importaciones repetidas dejaron varios INS idénticos por SSB.
   */
  const logicalBreakerGroup = (circuit: Circuit): Circuit[] => {
    const list = byOrigin.get(circuit.originId) ?? []
    const group = list.filter(
      (c) =>
        !c.virtual &&
        c.destinationId === circuit.destinationId &&
        c.protectionName === circuit.protectionName,
    )
    return group.length > 0 ? group : [circuit]
  }

  const groupFullyClosed = (circuit: Circuit) =>
    logicalBreakerGroup(circuit).every((c) => isClosed(c.id))

  const ssbIncomingList = (ssbId: string) =>
    (byOrigin.get(ssbId) ?? []).filter(isSsbIncomingCircuit)

  /** Cabecera SSB cerrada solo si todos los INS/NSX de entrada lo están. */
  const ssbIncomingFullyClosed = (ssbId: string) => {
    const list = ssbIncomingList(ssbId)
    if (list.length === 0) return true
    return list.every((c) => isClosed(c.id))
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

      // Cable sin interruptor (ABT→…, SBT→SCV): conduce si el origen está vivo
      if (isLinkOnlyOutgoingFeed(circuit)) {
        energizedCircuitIds.add(circuit.id)
        reachDestination(circuit.destinationId)
        continue
      }

      // Circuito real: interruptor cerrado (y todos sus clones lógicos)
      if (!groupFullyClosed(circuit)) continue

      // AUX 24 V (maniobra LCS / panel 0 MSB): fluye el circuito, no la barra.
      if (isAux24Feed(circuit)) {
        for (const c of logicalBreakerGroup(circuit)) {
          energizedCircuitIds.add(c.id)
        }
        continue
      }

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
        if (coupler && !isClosed(coupler.id)) continue
      }

      // SSB: salidas / INS requieren cabecera (todos los INS) cerrada.
      // Excepción: acometida ALT propia (QA en SSB-2PWS2209) no depende de QN.
      if (
        circuit.originId.startsWith('SSB-') &&
        circuit.notes !== 'ssb-2209-qa'
      ) {
        if (isSsbIncomingCircuit(circuit)) {
          if (!ssbIncomingFullyClosed(circuit.originId)) continue
          for (const ins of ssbIncomingList(circuit.originId)) {
            energizedCircuitIds.add(ins.id)
          }
          reachDestination(circuit.destinationId)
          continue
        }
        if (!ssbIncomingFullyClosed(circuit.originId)) continue
      }

      for (const c of logicalBreakerGroup(circuit)) {
        energizedCircuitIds.add(c.id)
      }
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

/**
 * Conmuta un interruptor. Si `data` incluye clones lógicos (mismo origen,
 * destino y nombre — p. ej. INS duplicados de SSB), los conmuta todos a la
 * vez para que el unifilar y el flujo de energía no diverjan.
 */
export function toggleProtectionState(
  status: ProtectionStatusMap,
  circuitId: string,
  data?: DistributionData,
): ProtectionStatusMap {
  const cur = status[circuitId] ?? 'abierta'
  const nextState = cur === 'abierta' ? 'cerrada' : 'abierta'
  const next: ProtectionStatusMap = { ...status, [circuitId]: nextState }

  if (!data) return next

  const seed = data.circuits.find((c) => c.id === circuitId)
  if (!seed || seed.virtual) return next

  const siblings = data.circuits.filter(
    (c) =>
      !c.virtual &&
      c.id !== circuitId &&
      c.originId === seed.originId &&
      c.destinationId === seed.destinationId &&
      c.protectionName === seed.protectionName,
  )
  // Cabecera SSB: cualquier INS/NSX de entrada del mismo cuadro
  const incomingSiblings =
    isSsbIncomingCircuit(seed)
      ? data.circuits.filter(
          (c) =>
            !c.virtual &&
            c.id !== circuitId &&
            c.originId === seed.originId &&
            isSsbIncomingCircuit(c),
        )
      : []

  for (const c of [...siblings, ...incomingSiblings]) {
    next[c.id] = nextState
  }
  return next
}
