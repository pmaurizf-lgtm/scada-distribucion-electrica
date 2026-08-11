/**
 * Persistencia local de la simulación (PWA / offline).
 * Misma app en desktop y móvil: los cambios de lógica de energía siguen
 * aplicando; solo se guarda/restaura el estado de usuario.
 */
import type { ProtectionStatusMap } from '../types'

const STORAGE_KEY = 'scada-f110-sim-v1'

export type PersistedSim = {
  v: 1
  protectionStatus: ProtectionStatusMap
  lockedCircuits: string[]
  runningGenerators: string[]
  savedAt: string
}

export function loadPersistedSim(): PersistedSim | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSim
    if (parsed?.v !== 1 || typeof parsed.protectionStatus !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function savePersistedSim(data: {
  protectionStatus: ProtectionStatusMap
  lockedCircuits: Set<string>
  runningGenerators: Set<string>
}): void {
  try {
    const payload: PersistedSim = {
      v: 1,
      protectionStatus: data.protectionStatus,
      lockedCircuits: [...data.lockedCircuits],
      runningGenerators: [...data.runningGenerators],
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* cuota / modo privado */
  }
}

export function clearPersistedSim(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
