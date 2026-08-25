import type { Circuit, Equipment } from '../types'
import type { UpstreamTrace } from '../utils/upstream'

/** Tramo NORM o ALT hacia el origen del grupo (columnas D–I del Excel MEP). */
export interface FeedLegInfo {
  equipmentId: string
  equipmentName: string
  local?: string
  protectionName: string
  circuitId: string
  lineType: 'normal' | 'alternativa'
}

/** Destino a alimentar (columna L) bajo un origen común (J). */
export interface StartupDestination {
  query: string
  equipmentId: string
  equipmentName: string
  local?: string
  /** Protección del bajante origen→destino */
  protectionName: string
  circuitId: string
  lineType: 'normal' | 'alternativa'
}

export interface StartupGroup {
  /** Origen común (como col. J) */
  originId: string
  originName: string
  originLocal?: string
  /** Acometidas al origen (NORM / ALT) */
  norm?: FeedLegInfo
  alt?: FeedLegInfo
  destinations: StartupDestination[]
  /** Traza aguas arriba del origen (para el árbol) */
  originTrace: UpstreamTrace
}

export interface ForestNode {
  id: string
  name: string
  local?: string
  kind: 'msb' | 'panel' | 'origin' | 'destination' | 'equipment'
  /** Protección del enlace desde el padre */
  protectionName?: string
  lineType?: 'normal' | 'alternativa'
  children: ForestNode[]
}

export interface StartupReport {
  title: string
  destinationsRequested: string[]
  resolvedIds: string[]
  unresolved: string[]
  groups: StartupGroup[]
  /** Árbol fusionado (prefijos compartidos) para preview / A3 */
  forest: ForestNode[]
  allCircuits: Circuit[]
  allEquipment: Equipment[]
}
