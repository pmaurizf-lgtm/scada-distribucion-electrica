import type { ProtectionStatusEntry, DistributionData } from '../types'
import { getTopology } from '../topology'
import { allSectionCouplers } from '../utils/cascadeModel'

/**
 * Estado inicial: todos los interruptores abiertos (desenergizado → verde).
 * Incluye acopladores de sección QBT1/QBT2 (sintéticos).
 */
export function buildOpenProtectionStatus(
  data: DistributionData = getTopology(),
): ProtectionStatusEntry[] {
  const fromExcel = data.circuits.map((c) => ({
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

/** @deprecated Preferir buildOpenProtectionStatus(data) al cambiar topología. */
export const sampleProtectionStatus: ProtectionStatusEntry[] =
  buildOpenProtectionStatus()

export function toProtectionStatusMap(
  entries: ProtectionStatusEntry[],
): Record<string, 'cerrada' | 'abierta'> {
  return Object.fromEntries(entries.map((e) => [e.circuitId, e.state]))
}
