/**
 * Cadena aguas abajo de un ABT (filosofía plano ABT → TRF → LCS 440/230).
 * Independiente del layout MSB; no altera cascadeModel / energyFlow del 690 V.
 */

import type { Circuit, Equipment, ServiceClass } from '../types'

/** Tensión de barra / salidas del centro de carga */
export type LoadCenterVoltage = '440' | '230'

/**
 * Centro de carga (LCS) bajo un transformador.
 * Datos 440/230 aún no están en system690; se rellenan desde abtDownstream.json.
 */
export interface LoadCenter {
  id: string
  name: string
  voltage: LoadCenterVoltage
  local?: string
  dcp10Id?: string
  /** Circuito TRF → LCS (cuando exista en datos) */
  feedCircuit?: Circuit
  /** Salidas del LCS (cuando existan) */
  outlets: {
    circuit: Circuit
    equipment: Equipment
    service?: ServiceClass | null
  }[]
}

/** Una cadena ABT → TRF → (LCS…) */
export interface AbtChain {
  abt: Equipment
  /** Circuito ABT → TRF (ya presente en system690) */
  toTransformer: Circuit
  transformer: Equipment
  loadCenters: LoadCenter[]
}
