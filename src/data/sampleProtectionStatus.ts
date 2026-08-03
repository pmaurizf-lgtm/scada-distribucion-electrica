import type { ProtectionStatusEntry } from '../types'
import { system690 } from './system690'

/**
 * Simulación del estado de protecciones sobre el sistema 690 V real.
 * - cerrada = energizada → rojo
 * - abierta = desenergizada → verde
 *
 * Por defecto: alternativas abiertas; el resto cerradas (salvo bus-tie
 * y algunos ejemplos).
 */
function buildSampleStatus(): ProtectionStatusEntry[] {
  return system690.circuits.map((c) => {
    let state: 'cerrada' | 'abierta' = 'cerrada'
    if (c.virtual) state = 'cerrada'
    else if (c.lineType === 'alternativa') state = 'abierta'
    // Ejemplo: bus-tie entre cuadros N-1 / N-2 abierto
    else if (c.protectionName === 'QT1B' || c.protectionName === 'QT2A') {
      state = 'abierta'
    }
    // Ejemplo: consumo en mantenimiento
    else if (c.destinationId === 'PMP-FOSS0001') state = 'abierta'
    return {
      circuitId: c.id,
      protectionName: c.protectionName,
      state,
    }
  })
}

export const sampleProtectionStatus: ProtectionStatusEntry[] =
  buildSampleStatus()

export function toProtectionStatusMap(
  entries: ProtectionStatusEntry[],
): Record<string, 'cerrada' | 'abierta'> {
  return Object.fromEntries(entries.map((e) => [e.circuitId, e.state]))
}
