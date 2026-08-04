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
  /** Acoplamiento entre mitades SA↔SB (si existe en datos; si no, lógico) */
  sectionCoupler: { id: string; label: string }
  /** Enlace a la otra barra (bus-tie) */
  busTie: Circuit[]
  gens: { half: BusHalf; gen: Equipment; breaker: Circuit }[]
  feeders: FeederOutlet[]
}

export function halfFromPanel(panelId: string): BusHalf | null {
  const m = panelId.match(/MSB[12]\d{2}([AB])$/i)
  if (!m) return null
  return m[1].toUpperCase() === 'A' ? 'SA' : 'SB'
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

export function buildBoardModels(data: DistributionData): BoardModel[] {
  const eq = (id: string) => data.equipment.find((e) => e.id === id)!

  const boards: { id: BoardId; name: string; gens: [string, string]; coupler: string }[] = [
    {
      id: 'MSB-6PWS0001',
      name: 'CUADRO PRINCIPAL PROA (MSB-6PWS0001)',
      gens: ['SDG-GENS0001', 'SDG-GENS0002'],
      coupler: 'QT1', // acoplamiento interno 1SA↔1SB (plano planta)
    },
    {
      id: 'MSB-6PWS0002',
      name: 'CUADRO PRINCIPAL POPA (MSB-6PWS0002)',
      gens: ['SDG-GENS0003', 'SDG-GENS0004'],
      coupler: 'QT2',
    },
  ]

  return boards.map((b) => {
    const boardEq = eq(b.id)
    const gens = b.gens.map((genId, idx) => {
      const half: BusHalf = idx === 0 ? 'SA' : 'SB'
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

    const busTie = data.circuits.filter(
      (c) =>
        (c.protectionName === 'QT1B' || c.protectionName === 'QT2A') &&
        (c.originId.includes(b.id === 'MSB-6PWS0001' ? 'MSB10' : 'MSB20') ||
          c.destinationId.includes(b.id === 'MSB-6PWS0001' ? 'MSB10' : 'MSB20')),
    )

    return {
      id: b.id,
      name: boardEq?.name ?? b.name,
      local: boardEq?.local,
      sectionCoupler: {
        id: b.coupler,
        label: `${b.coupler} · acoplamiento ${b.id === 'MSB-6PWS0001' ? '1SA↔1SB' : '2SA↔2SB'}`,
      },
      busTie,
      gens,
      feeders,
    }
  })
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
