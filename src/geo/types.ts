/**
 * Modelo geométrico del unifilar (producto paralelo).
 * Coordenadas en unidades de mundo (px lógicos); el visor SVG aplica pan/zoom.
 * La topología (system690) sigue siendo la fuente de ids; este documento aporta XY.
 */

export type GeoNodeKind =
  | 'equipment'
  | 'breaker'
  | 'bus'
  | 'text'
  | 'frame'

export type GeoLayer =
  | 'structure'
  | 'bus'
  | 'breaker'
  | 'equipment'
  | 'wire'
  | 'label'

export interface GeoPoint {
  x: number
  y: number
}

export interface GeoNode {
  id: string
  kind: GeoNodeKind
  layer: GeoLayer
  x: number
  y: number
  width: number
  height: number
  /** Grados, sentido horario SVG */
  rotation?: number
  label?: string
  /** Enlace a topología */
  equipmentId?: string
  circuitId?: string
  /** Estilo libre (p. ej. half SA/SB) */
  tags?: Record<string, string>
}

export interface GeoWire {
  id: string
  layer: 'wire'
  /** Polyline en coordenadas de mundo */
  points: GeoPoint[]
  circuitId?: string
  lineType?: 'normal' | 'alternativa'
  label?: string
}

export interface GeoViewBox {
  x: number
  y: number
  width: number
  height: number
}

/** Documento de layout versionado — import/export JSON (base para DXF futuro). */
export interface LayoutDocument {
  v: 1
  name: string
  unit: 'world'
  viewBox: GeoViewBox
  nodes: GeoNode[]
  wires: GeoWire[]
  meta?: {
    seededFrom?: string
    vessel?: string
    updatedAt?: string
    notes?: string
  }
}

export function isLayoutDocument(value: unknown): value is LayoutDocument {
  if (!value || typeof value !== 'object') return false
  const d = value as LayoutDocument
  return (
    d.v === 1 &&
    typeof d.name === 'string' &&
    d.unit === 'world' &&
    Array.isArray(d.nodes) &&
    Array.isArray(d.wires) &&
    !!d.viewBox &&
    typeof d.viewBox.width === 'number'
  )
}
