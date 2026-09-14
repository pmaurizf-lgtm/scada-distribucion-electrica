/**
 * Topología del unifilar en memoria de sesión.
 * No se escribe en localStorage, IndexedDB ni Firebase.
 */
import { useSyncExternalStore } from 'react'
import {
  embeddedSystem690,
  restoreEmbeddedSystem690,
  setSessionSystem690,
  system690,
} from '../data/system690'
import type { DistributionData } from '../types'
import {
  parseCircuitListExcel,
  type CircuitListImportStats,
} from './parseCircuitListExcel'

type TopologyState = {
  data: DistributionData
  sessionOverride: boolean
  fileName: string | null
  stats: CircuitListImportStats | null
  revision: number
  /** Aviso UI no sensible (conteos / nombre de archivo). */
  notice: string | null
}

let meta: Omit<TopologyState, 'data'> = {
  sessionOverride: false,
  fileName: null,
  stats: null,
  revision: 0,
  notice: null,
}

/** Snapshot estable: useSyncExternalStore exige misma referencia si no hay cambio. */
let cachedState: TopologyState = { data: system690, ...meta }

const listeners = new Set<() => void>()

function refreshCache() {
  cachedState = { data: system690, ...meta }
}

function emit() {
  refreshCache()
  for (const l of listeners) l()
}

export function getTopology(): DistributionData {
  return system690
}

export function getTopologyState(): TopologyState {
  return cachedState
}

export function getEmbeddedTopology(): DistributionData {
  return embeddedSystem690
}

export function subscribeTopology(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function loadTopologyFromExcel(
  buffer: ArrayBuffer,
  fileName: string,
): CircuitListImportStats {
  const result = parseCircuitListExcel(buffer, fileName)
  setSessionSystem690(result.data)
  meta = {
    sessionOverride: true,
    fileName,
    stats: result.stats,
    revision: meta.revision + 1,
    notice: `Unifilar actualizado desde «${fileName}» (${result.stats.circuits} circuitos, ${result.stats.sheetsUsed.length} hojas). Solo esta sesión: no se guarda en el equipo.`,
  }
  emit()
  return result.stats
}

export function resetTopologyToEmbedded(): void {
  if (!meta.sessionOverride && !meta.notice) return
  restoreEmbeddedSystem690()
  meta = {
    sessionOverride: false,
    fileName: null,
    stats: null,
    revision: meta.revision + 1,
    notice:
      'Restaurada la lista de circuitos embebida. La carga Excel de sesión se descartó.',
  }
  emit()
}

export function clearTopologyNotice(): void {
  if (!meta.notice) return
  meta = { ...meta, notice: null }
  emit()
}

export function dcp10Of(pumaId: string): string | undefined {
  return system690.equipment.find((e) => e.id === pumaId)?.dcp10Id
}

export function useTopology(): DistributionData {
  return useSyncExternalStore(subscribeTopology, getTopology, getTopology)
}

export function useTopologyState(): TopologyState {
  return useSyncExternalStore(
    subscribeTopology,
    getTopologyState,
    getTopologyState,
  )
}
