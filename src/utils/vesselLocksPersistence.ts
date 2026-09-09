/**
 * Candados LOTO por buque (independientes).
 * El unifilar (circuitos / interruptores) es compartido.
 */
import type { CircuitLockInfo } from './parseLocksExcel'
import type { VesselId } from '../vessels/vesselCatalog'
import { vesselUsesSeedLocks } from '../vessels/vesselCatalog'
import lockListSeed from '../data/lockList.json'

const SEED_LOCKS: Record<string, CircuitLockInfo> = (
  lockListSeed as { locks?: Record<string, CircuitLockInfo> }
).locks ?? {}

export type PersistedVesselLocks = {
  v: 1
  lockedCircuits: string[]
  lockInfoByCircuit: Record<string, CircuitLockInfo>
  savedAt: string
}

function storageKey(vesselId: VesselId): string {
  return `scada-vessel-${vesselId}-locks-v1`
}

export function defaultLocksForVessel(vesselId: VesselId): {
  lockedCircuits: string[]
  lockInfoByCircuit: Record<string, CircuitLockInfo>
} {
  if (vesselUsesSeedLocks(vesselId)) {
    return {
      lockedCircuits: Object.keys(SEED_LOCKS),
      lockInfoByCircuit: { ...SEED_LOCKS },
    }
  }
  return { lockedCircuits: [], lockInfoByCircuit: {} }
}

export function loadVesselLocks(vesselId: VesselId): {
  lockedCircuits: string[]
  lockInfoByCircuit: Record<string, CircuitLockInfo>
} {
  try {
    const raw = localStorage.getItem(storageKey(vesselId))
    if (!raw) return defaultLocksForVessel(vesselId)
    const parsed = JSON.parse(raw) as PersistedVesselLocks
    if (
      parsed?.v !== 1 ||
      !Array.isArray(parsed.lockedCircuits) ||
      typeof parsed.lockInfoByCircuit !== 'object' ||
      parsed.lockInfoByCircuit == null
    ) {
      return defaultLocksForVessel(vesselId)
    }
    return {
      lockedCircuits: parsed.lockedCircuits,
      lockInfoByCircuit: { ...parsed.lockInfoByCircuit },
    }
  } catch {
    return defaultLocksForVessel(vesselId)
  }
}

export function saveVesselLocks(
  vesselId: VesselId,
  data: {
    lockedCircuits: Set<string> | string[]
    lockInfoByCircuit: Record<string, CircuitLockInfo>
  },
): void {
  try {
    const locked = Array.isArray(data.lockedCircuits)
      ? data.lockedCircuits
      : [...data.lockedCircuits]
    const payload: PersistedVesselLocks = {
      v: 1,
      lockedCircuits: locked,
      lockInfoByCircuit: { ...data.lockInfoByCircuit },
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(storageKey(vesselId), JSON.stringify(payload))
  } catch {
    /* cuota / modo privado */
  }
}

export { SEED_LOCKS as F111_SEED_LOCKS }
