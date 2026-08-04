import type { ProtectionStatusEntry } from '../types'
import { system690 } from './system690'
import { allSectionCouplers } from '../utils/cascadeModel'

/**
 * Estado inicial: todos los interruptores abiertos (desenergizado → verde).
 * Incluye acopladores de sección QBT1/QBT2 (sintéticos).
 */
function buildSampleStatus(): ProtectionStatusEntry[] {
  const fromExcel = system690.circuits.map((c) => ({
    circuitId: c.id,
    protectionName: c.protectionName,
    state: 'abierta' as const,
  }))
  const qbts = allSectionCouplers().map((c) => ({
    circuitId: c.id,
    protectionName: c.protectionName,
    state: 'abierta' as const,
  }))
  return [...fromExcel, ...qbts]
}

export const sampleProtectionStatus: ProtectionStatusEntry[] =
  buildSampleStatus()

export function toProtectionStatusMap(
  entries: ProtectionStatusEntry[],
): Record<string, 'cerrada' | 'abierta'> {
  return Object.fromEntries(entries.map((e) => [e.circuitId, e.state]))
}
