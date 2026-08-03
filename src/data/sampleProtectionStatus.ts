import type { ProtectionStatusEntry } from '../types'

/**
 * Simulación del futuro archivo de estado de protecciones
 * (circuitos cerrados / abiertos). Convención SCADA industrial:
 * - cerrada = energizada / interruptor cerrado → rojo
 * - abierta = desenergizada / interruptor abierto → verde
 */
export const sampleProtectionStatus: ProtectionStatusEntry[] = [
  { circuitId: 'C-001', protectionName: 'ACB GEN-1', state: 'cerrada' },
  { circuitId: 'C-002', protectionName: 'ACB GEN-2', state: 'cerrada' },
  { circuitId: 'C-003', protectionName: 'ACB BUS-TIE', state: 'abierta' },
  { circuitId: 'C-004', protectionName: 'MCCB GEN-EM', state: 'cerrada' },
  { circuitId: 'C-005', protectionName: 'MCCB ESB-N', state: 'cerrada' },
  { circuitId: 'C-006', protectionName: 'MCCB ESB-A', state: 'abierta' },
  { circuitId: 'C-007', protectionName: 'MCCB ENG', state: 'cerrada' },
  { circuitId: 'C-008', protectionName: 'MCCB DECK', state: 'cerrada' },
  { circuitId: 'C-009', protectionName: 'MCCB XFMR', state: 'cerrada' },
  { circuitId: 'C-010', protectionName: 'MCCB ACC', state: 'cerrada' },
  { circuitId: 'C-011', protectionName: 'MCCB PUMP-SW', state: 'cerrada' },
  { circuitId: 'C-012', protectionName: 'MCCB PUMP-SW-A', state: 'abierta' },
  { circuitId: 'C-013', protectionName: 'MCCB PUMP-FW', state: 'abierta' },
  { circuitId: 'C-014', protectionName: 'MCCB FAN', state: 'cerrada' },
  { circuitId: 'C-015', protectionName: 'MCCB FAN-A', state: 'abierta' },
  { circuitId: 'C-016', protectionName: 'MCCB WINCH', state: 'cerrada' },
  { circuitId: 'C-017', protectionName: 'MCB LIGHT', state: 'cerrada' },
  { circuitId: 'C-018', protectionName: 'MCB NAV', state: 'cerrada' },
  { circuitId: 'C-019', protectionName: 'MCB NAV-A', state: 'abierta' },
]

export function toProtectionStatusMap(
  entries: ProtectionStatusEntry[],
): Record<string, 'cerrada' | 'abierta'> {
  return Object.fromEntries(entries.map((e) => [e.circuitId, e.state]))
}
