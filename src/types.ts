/** Filas equivalentes a las columnas del Excel de circuitos */
export type LineType = 'normal' | 'alternativa'

/** Vitalidad del servicio (columna N del Excel) */
export type ServiceClass = 'VM' | 'VS' | 'NV'

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
  /** Local / compartimento (cols G / K) */
  local?: string
  voltage?: string
  description?: string
  /** Nodo sintético (p. ej. barra de cuadro principal) */
  virtual?: boolean
  /** Hueco de reserva (RESPETO / SPARE, Excel col. L) */
  spare?: boolean
  /**
   * Denominación DCP-10 (Excel col. J destino / F origen).
   * `id` es la denominación PUMA (cols I / E).
   */
  dcp10Id?: string
  /**
   * Interruptor de entrada del cuadro (Excel «Incoming Power Switch», p. ej. INS 160).
   * Típico en SSB 440 V aguas abajo del LCS.
   */
  incomingSwitch?: string
}

export interface Circuit {
  id: string
  name: string
  originId: string
  destinationId: string
  /** Referencia de circuito Excel col. D */
  circuitRef?: string
  protectionName: string
  /** Modelo del interruptor (col. AE) */
  protectionModel?: string
  /** Intensidad nominal In [A] (col. AF) */
  protectionCurrentA?: number | null
  lineType: LineType
  /** VM / VS / NV (col. N) */
  service?: ServiceClass | null
  /** P [kWe] col. AJ */
  pKWe?: number | null
  /** Q [kVAr] col. AK */
  qKVAr?: number | null
  /** S [kVA] col. AL */
  sKVA?: number | null
  /** Ib [A] col. AM */
  ibA?: number | null
  /** Pn [kW] col. O */
  pnKW?: number | null
  voltage?: string
  parallelCables?: number
  virtual?: boolean
  /** Circuito RESPETO (Excel col. L) */
  spare?: boolean
  excelRow?: number | null
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
