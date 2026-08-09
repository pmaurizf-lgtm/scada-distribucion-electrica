/**
 * Modelos de planta para pestañas 115 V y 400 Hz (fuera del MSB 690).
 */

import { system690 } from '../data/system690'
import type { Circuit, Equipment } from '../types'
import { hasSsbBoardLayout } from '../abtDownstream/ssbBoard'

export type SystemTabId = '690' | '115' | '400'

export const SYSTEM_TABS: {
  id: SystemTabId
  label: string
  title: string
}[] = [
  { id: '690', label: '690 V', title: '690V Power System' },
  { id: '115', label: '115 V', title: '115V Power System' },
  { id: '400', label: '400 Hz', title: '400Hz Power System' },
]

export type SystemChain = {
  /** Fuente (TRF / SCV) */
  source: Equipment
  /** Circuito fuente → cuadro */
  feed: Circuit
  /** Cuadro principal de la cadena */
  board: Equipment
}

function eq(id: string): Equipment | undefined {
  return system690.equipment.find((e) => e.id === id)
}

/** Cadenas TRF-4PWS* → SSB-1PWS* (115 V). */
export function build115Chains(): SystemChain[] {
  const chains: SystemChain[] = []
  for (const c of system690.circuits) {
    if (c.virtual || c.spare) continue
    if (!/^TRF-4PWS/i.test(c.originId)) continue
    if (!/^SSB-1PWS/i.test(c.destinationId)) continue
    if (!String(c.voltage ?? '').startsWith('115')) continue
    const source = eq(c.originId)
    const board = eq(c.destinationId)
    if (!source || !board) continue
    chains.push({ source, feed: c, board })
  }
  return chains.sort((a, b) =>
    a.board.id.localeCompare(b.board.id, 'es'),
  )
}

/**
 * Cadenas SCV-4SFS* → MSB-4SFS* (400 Hz).
 * Preferir acometida con notes hz400 / protection Q00.
 */
export function build400Chains(): SystemChain[] {
  const chains: SystemChain[] = []
  for (const c of system690.circuits) {
    if (c.virtual || c.spare) continue
    if (!/^SCV-4SFS/i.test(c.originId)) continue
    if (!/^MSB-4SFS/i.test(c.destinationId)) continue
    const source = eq(c.originId)
    const board = eq(c.destinationId)
    if (!source || !board) continue
    chains.push({ source, feed: c, board })
  }
  // Si faltara SCV→MSB, mostrar MSB con primer feed hz400
  if (chains.length === 0) {
    for (const board of system690.equipment.filter((e) =>
      /^MSB-4SFS/i.test(e.id),
    )) {
      const feed = system690.circuits.find(
        (c) =>
          !c.virtual &&
          c.destinationId === board.id &&
          (c.notes === 'hz400' || /^SCV-4SFS/i.test(c.originId)),
      )
      if (!feed) continue
      const source = eq(feed.originId)
      if (!source) continue
      chains.push({ source, feed, board })
    }
  }
  return chains.sort((a, b) => a.board.id.localeCompare(b.board.id, 'es'))
}

export function chainsForTab(tab: SystemTabId): SystemChain[] {
  if (tab === '115') return build115Chains()
  if (tab === '400') return build400Chains()
  return []
}

export function boardHasInterior(board: Equipment): boolean {
  return hasSsbBoardLayout(board) || /^MSB-4SFS/i.test(board.id)
}
