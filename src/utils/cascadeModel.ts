import type { Circuit, DistributionData, Equipment, LineType } from '../types'
import { isMsbFeeder, feederSection } from './viewFilter'

export type BoardId = 'MSB-6PWS0001' | 'MSB-6PWS0002'
export type BusHalf = 'SA' | 'SB'

export interface FeederOutlet {
  circuit: Circuit
  equipment: Equipment
  half: BusHalf
  breaker: string
}

export interface BoardModel {
  id: BoardId
  name: string
  local?: string
  /** Acoplador de sección SA↔SB (QBT1 / QBT2) */
  sectionCoupler: Circuit
  /** Enlace a la otra barra (bus-tie) */
  busTie: Circuit[]
  gens: { half: BusHalf; gen: Equipment; breaker: Circuit }[]
  feeders: FeederOutlet[]
}

/** Circuitos sintéticos de acoplamiento de sección (no vienen del Excel) */
export function sectionCouplerCircuit(boardId: BoardId): Circuit {
  if (boardId === 'MSB-6PWS0001') {
    return {
      id: 'synth-QBT1',
      circuitRef: 'MSB-6PWS0001-QBT1',
      name: 'Acoplamiento 1SB ↔ 1SA',
      originId: 'PNL-MSB1001B',
      destinationId: 'PNL-MSB1001A',
      protectionName: 'QBT1',
      protectionModel: 'Motorizado · acoplador de sección',
      lineType: 'normal',
      service: 'VS',
      voltage: '690',
      notes: 'Acoplador de barras 1SB-1SA (sintético)',
    }
  }
  return {
    id: 'synth-QBT2',
    circuitRef: 'MSB-6PWS0002-QBT2',
    name: 'Acoplamiento 2SB ↔ 2SA',
    originId: 'PNL-MSB2001B',
    destinationId: 'PNL-MSB2001A',
    protectionName: 'QBT2',
    protectionModel: 'Motorizado · acoplador de sección',
    lineType: 'normal',
    service: 'VS',
    voltage: '690',
    notes: 'Acoplador de barras 2SB-2SA (sintético)',
  }
}

export function allSectionCouplers(): Circuit[] {
  return [sectionCouplerCircuit('MSB-6PWS0001'), sectionCouplerCircuit('MSB-6PWS0002')]
}

export function halfFromPanel(panelId: string): BusHalf | null {
  // PNL-MSB1001A → barra 1, sección 001, mitad A (SA)
  // PNL-MSB2008B → barra 2, sección 008, mitad B (SB)
  const m = panelId.match(/MSB([12])\d{3}([AB])$/i)
  if (!m) return null
  return m[2].toUpperCase() === 'A' ? 'SA' : 'SB'
}

export function halfFromFeeder(circuit: Circuit): BusHalf | null {
  const sec = feederSection(circuit)
  if (!sec) return null
  return sec.endsWith('A') ? 'SA' : 'SB'
}

export function boardFromOrigin(originId: string): BoardId | null {
  if (/PNL-MSB10|MSB-6PWS0001|SDG-GENS000[12]/.test(originId)) return 'MSB-6PWS0001'
  if (/PNL-MSB20|MSB-6PWS0002|SDG-GENS000[34]/.test(originId)) return 'MSB-6PWS0002'
  return null
}

/** Orden del esquema funcional: POPA (N-2) a la izquierda, PROA (N-1) a la derecha */
export function buildBoardModels(data: DistributionData): BoardModel[] {
  const eq = (id: string) => data.equipment.find((e) => e.id === id)!

  /** gens: [SB, SA] — orden visual del plano (G*B | G*A) */
  const boards: {
    id: BoardId
    name: string
    gens: [string, string]
  }[] = [
    {
      id: 'MSB-6PWS0002',
      name: 'CUADRO PRINCIPAL POPA (MSB-6PWS0002)',
      gens: ['SDG-GENS0004', 'SDG-GENS0003'],
    },
    {
      id: 'MSB-6PWS0001',
      name: 'CUADRO PRINCIPAL PROA (MSB-6PWS0001)',
      gens: ['SDG-GENS0002', 'SDG-GENS0001'],
    },
  ]

  const qt1b = data.circuits.find((c) => c.protectionName === 'QT1B')
  const qt2a = data.circuits.find((c) => c.protectionName === 'QT2A')

  return boards.map((b) => {
    const boardEq = eq(b.id)
    const gens = b.gens.map((genId, idx) => {
      const half: BusHalf = idx === 0 ? 'SB' : 'SA'
      const breaker = data.circuits.find((c) => c.originId === genId)!
      return { half, gen: eq(genId), breaker }
    })

    const feeders: FeederOutlet[] = data.circuits
      .filter((c) => isMsbFeeder(c) && boardFromOrigin(c.originId) === b.id)
      .map((c) => ({
        circuit: c,
        equipment: eq(c.destinationId),
        half: halfFromFeeder(c) ?? halfFromPanel(c.originId) ?? 'SA',
        breaker: c.protectionName,
      }))
      .sort((a, b2) => a.breaker.localeCompare(b2.breaker, undefined, { numeric: true }))

    /** Interconexión 2SA↔1SB: QT2A en N-2 (SA), QT1B en N-1 (SB) */
    const busTie =
      b.id === 'MSB-6PWS0002'
        ? qt2a
          ? [qt2a]
          : []
        : qt1b
          ? [qt1b]
          : []

    return {
      id: b.id,
      name: boardEq?.name ?? b.name,
      local: boardEq?.local,
      sectionCoupler: sectionCouplerCircuit(b.id),
      busTie,
      gens,
      feeders,
    }
  })
}

export function busTieCircuits(data: DistributionData): {
  qt2a?: Circuit
  qt1b?: Circuit
} {
  return {
    qt2a: data.circuits.find((c) => c.protectionName === 'QT2A'),
    qt1b: data.circuits.find((c) => c.protectionName === 'QT1B'),
  }
}

/** Circuitos hijos reales (no virtuales) que salen de un equipo */
export function childFeeders(
  data: DistributionData,
  equipmentId: string,
): { circuit: Circuit; equipment: Equipment }[] {
  return data.circuits
    .filter(
      (c) =>
        !c.virtual &&
        c.originId === equipmentId &&
        c.destinationId !== equipmentId,
    )
    .map((c) => ({
      circuit: c,
      equipment: data.equipment.find((e) => e.id === c.destinationId)!,
    }))
    .filter((x) => x.equipment)
    .sort((a, b) =>
      a.circuit.protectionName.localeCompare(b.circuit.protectionName, undefined, {
        numeric: true,
      }),
    )
}

/** Todas las alimentaciones entrantes a un equipo (normal / alt.) */
export function incomingFeeds(
  data: DistributionData,
  equipmentId: string,
): Circuit[] {
  return data.circuits.filter(
    (c) => !c.virtual && c.destinationId === equipmentId,
  )
}

export function lineBadge(t: LineType): string {
  return t === 'alternativa' ? 'ALT' : 'NORM'
}
