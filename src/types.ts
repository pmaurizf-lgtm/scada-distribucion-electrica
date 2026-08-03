/** Filas equivalentes a las columnas del Excel de circuitos */
export type LineType = 'normal' | 'alternativa'

/** Estado de la protección / interruptor del circuito */
export type ProtectionState = 'cerrada' | 'abierta'

export type EquipmentKind =
  | 'generador'
  | 'conversion'
  | 'cuadro_principal'
  | 'cuadro_secundario'
  | 'consumidor'

export interface Equipment {
  id: string
  name: string
  kind: EquipmentKind
  voltage?: string
  description?: string
}

export interface Circuit {
  id: string
  name: string
  originId: string
  destinationId: string
  protectionName: string
  protectionCurrentA: number
  lineType: LineType
  voltage?: string
  cableSection?: string
  notes?: string
}

export interface DistributionData {
  title: string
  vessel: string
  equipment: Equipment[]
  circuits: Circuit[]
}

/** Estado de protecciones (archivo futuro o simulación) */
export interface ProtectionStatusEntry {
  circuitId: string
  protectionName?: string
  state: ProtectionState
}

export type ProtectionStatusMap = Record<string, ProtectionState>

export type Selection =
  | { type: 'equipment'; item: Equipment; circuits: Circuit[] }
  | { type: 'circuit'; item: Circuit }
  | {
      type: 'search'
      item: Equipment
      upstreamCircuits: Circuit[]
      upstreamEquipmentIds: string[]
    }
  | null
