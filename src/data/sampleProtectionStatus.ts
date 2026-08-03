import type { ProtectionStatusEntry } from '../types'
import { system690 } from './system690'

/**
 * Estado inicial: todos los interruptores abiertos (desenergizado → verde).
 */
function buildSampleStatus(): ProtectionStatusEntry[] {
  return system690.circuits.map((c) => ({
    circuitId: c.id,
    protectionName: c.protectionName,
    state: 'abierta' as const,
  }))
}

export const sampleProtectionStatus: ProtectionStatusEntry[] =
  buildSampleStatus()

export function toProtectionStatusMap(
  entries: ProtectionStatusEntry[],
): Record<string, 'cerrada' | 'abierta'> {
  return Object.fromEntries(entries.map((e) => [e.circuitId, e.state]))
}
