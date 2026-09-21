/**
 * Topología del unifilar en memoria de sesión.
 * Revisiones embebidas Rev.C / Rev.D; Excel de sesión solo sobre Rev.D.
 * No se escribe en localStorage, IndexedDB ni Firebase.
 */
import { useSyncExternalStore } from 'react'
import {
  embeddedRevC,
  embeddedRevD,
  embeddedSystem690,
  setSessionSystem690,
  system690,
  type CircuitListRevision,
} from '../data/system690'
import type { DistributionData } from '../types'
import {
  parseCircuitListExcel,
  type CircuitListImportStats,
} from './parseCircuitListExcel'

export type { CircuitListRevision }

type SessionD = {
  data: DistributionData
  fileName: string
  stats: CircuitListImportStats
}

type TopologyState = {
  data: DistributionData
  /** Revisión elegida en el desplegable (C o D). */
  listRevision: CircuitListRevision
  /** true si Rev.D está sustituida por un Excel de sesión. */
  sessionOverride: boolean
  fileName: string | null
  stats: CircuitListImportStats | null
  revision: number
  /** Aviso UI no sensible (conteos / nombre de archivo). */
  notice: string | null
}

const STORAGE_KEY = 'scada-circuit-list-revision-v1'

function readStoredRevision(): CircuitListRevision {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    if (v === 'C' || v === 'D') return v
  } catch {
    /* ignore */
  }
  return 'C'
}

function writeStoredRevision(rev: CircuitListRevision): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, rev)
  } catch {
    /* ignore */
  }
}

let listRevision: CircuitListRevision = readStoredRevision()
let sessionD: SessionD | null = null

let meta: Omit<TopologyState, 'data'> = {
  listRevision,
  sessionOverride: false,
  fileName: embeddedFor(listRevision).sourceFile ?? null,
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

function embeddedFor(rev: CircuitListRevision): DistributionData {
  return rev === 'D' ? embeddedRevD : embeddedRevC
}

function applyActive(notice: string | null = null): void {
  if (listRevision === 'C') {
    setSessionSystem690(embeddedRevC)
    meta = {
      listRevision: 'C',
      sessionOverride: false,
      fileName: embeddedRevC.sourceFile ?? null,
      stats: null,
      revision: meta.revision + 1,
      notice,
    }
  } else if (sessionD) {
    setSessionSystem690(sessionD.data)
    meta = {
      listRevision: 'D',
      sessionOverride: true,
      fileName: sessionD.fileName,
      stats: sessionD.stats,
      revision: meta.revision + 1,
      notice,
    }
  } else {
    setSessionSystem690(embeddedRevD)
    meta = {
      listRevision: 'D',
      sessionOverride: false,
      fileName: embeddedRevD.sourceFile ?? null,
      stats: null,
      revision: meta.revision + 1,
      notice,
    }
  }
  writeStoredRevision(listRevision)
  emit()
}

// Arranque: alinear system690 con la revisión de sessionStorage (C por defecto).
setSessionSystem690(embeddedFor(listRevision))
refreshCache()

export function getTopology(): DistributionData {
  return system690
}

export function getTopologyState(): TopologyState {
  return cachedState
}

export function getEmbeddedTopology(): DistributionData {
  return embeddedFor(listRevision)
}

export function getEmbeddedRevision(
  rev: CircuitListRevision,
): DistributionData {
  return embeddedFor(rev)
}

export function subscribeTopology(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Cambia entre Rev.C y Rev.D (conserva Excel de sesión de D si existía). */
export function selectCircuitListRevision(rev: CircuitListRevision): void {
  listRevision = rev
  const label = rev === 'C' ? 'Rev.C' : 'Rev.D'
  const file =
    rev === 'C'
      ? embeddedRevC.sourceFile
      : sessionD?.fileName ?? embeddedRevD.sourceFile
  applyActive(
    `Lista de circuitos: ${label}${file ? ` («${file}»)` : ''}. Unifilar e informes usan esta revisión.`,
  )
}

/**
 * Carga Excel solo como override de Rev.D (sesión).
 * Si la revisión activa es C, conmuta a D automáticamente.
 */
export function loadTopologyFromExcel(
  buffer: ArrayBuffer,
  fileName: string,
): CircuitListImportStats {
  const result = parseCircuitListExcel(buffer, fileName)
  sessionD = {
    data: result.data,
    fileName,
    stats: result.stats,
  }
  listRevision = 'D'
  applyActive(
    `Rev.D actualizada desde «${fileName}» (${result.stats.circuits} circuitos, ${result.stats.sheetsUsed.length} hojas). Solo esta sesión: no se guarda en el equipo.`,
  )
  return result.stats
}

/** Descarta el Excel de sesión y vuelve a la Rev.D embebida. */
export function resetTopologyToEmbedded(): void {
  if (!sessionD && listRevision === 'D' && !meta.notice) return
  sessionD = null
  listRevision = 'D'
  applyActive(
    'Restaurada la Rev.D embebida. La carga Excel de sesión se descartó.',
  )
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

/** Etiquetas cortas para el desplegable de revisión. */
export function circuitListRevisionLabel(rev: CircuitListRevision): string {
  const data = embeddedFor(rev)
  const base =
    data.sourceFile?.replace(/\.[^.]+$/, '') ??
    (rev === 'C' ? 'Lista circuitos Rev.C' : 'Lista circuitos Rev.D')
  if (rev === 'D' && sessionD) {
    return `${sessionD.fileName.replace(/\.[^.]+$/, '')} · sesión`
  }
  return base
}

// Reexport por si algún consumidor necesitaba el alias D.
export { embeddedSystem690 }
