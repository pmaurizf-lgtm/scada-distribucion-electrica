/**
 * SSB-2PWS4531 (Excel fila 2864): INS → Q01 → 6 bases enchufe trifásicas IEC 60309.
 */

import type { Circuit, DistributionData, Equipment } from '../types'

export const SSB_2PWS4531_ID = 'SSB-2PWS4531'
export const SSB_4531_SKT_BUS = `BUS-${SSB_2PWS4531_ID}-SKT`

export const SSB_4531_SOCKET_NOTE = 'ssb4531-socket'

export function isSsb2Pws4531(id: string): boolean {
  return id === SSB_2PWS4531_ID
}

export function isSsb4531SocketBus(eq: Equipment): boolean {
  return eq.id === SSB_4531_SKT_BUS
}

export function isSsb4531SocketFeed(c: Circuit): boolean {
  return c.notes === SSB_4531_SOCKET_NOTE
}

export type Ssb4531Model = {
  ins: Circuit | undefined
  q01: Circuit | undefined
  sktBus: Equipment | undefined
  sockets: { circuit: Circuit; equipment: Equipment; index: number }[]
}

export function buildSsb4531Model(data: DistributionData): Ssb4531Model {
  const ins = data.circuits.find(
    (c) => c.originId === SSB_2PWS4531_ID && c.notes === 'ssb-incoming',
  )
  const q01 = data.circuits.find(
    (c) =>
      !c.virtual &&
      c.originId === SSB_2PWS4531_ID &&
      c.protectionName === 'Q01',
  )
  const sktBus = data.equipment.find((e) => e.id === SSB_4531_SKT_BUS)
  const socketCircuits = data.circuits
    .filter((c) => c.notes === SSB_4531_SOCKET_NOTE)
    .sort((a, b) => a.destinationId.localeCompare(b.destinationId, undefined, { numeric: true }))

  const sockets = socketCircuits.flatMap((circuit, i) => {
    const equipment = data.equipment.find((e) => e.id === circuit.destinationId)
    if (!equipment) return []
    const m = /-(\d{2})$/.exec(circuit.destinationId)
    return [{ circuit, equipment, index: m ? Number(m[1]) : i + 1 }]
  })

  return { ins, q01, sktBus, sockets }
}
