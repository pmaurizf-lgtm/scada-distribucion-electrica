/**
 * Cadena aguas abajo de un ABT (filosofía plano ABT → TRF → LCS 440/230).
 */

import type { Circuit, Equipment, ServiceClass } from '../types'

export type LoadCenterVoltage = '440' | '230'

export interface LcsOutlet {
  circuit: Circuit
  equipment: Equipment
  service: ServiceClass | null
}

export interface LcsSection {
  service: ServiceClass
  /** QVM / QNV de sección (Excel) */
  sectionBreaker?: Circuit
  outlets: LcsOutlet[]
}

/** Entrada paralela a QVS (p. ej. CSB → QS1-440 junto al TRF). */
export interface LcsParallelIncoming {
  circuit: Circuit
  equipment: Equipment
}

export interface LcsVoltageBus {
  voltage: LoadCenterVoltage
  /** Interruptor de entrada desde TRF (QVS-440 / QVS-230) */
  incoming: Circuit
  /**
   * Alimentación paralela a QVS (arriba de la barra VS).
   * Caso LCS-4PWS0003: CSB-4PWS0001 → QS1-440.
   */
  parallelIncoming?: LcsParallelIncoming
  sections: LcsSection[]
}

export interface LcsBoardModel {
  lcs: Equipment
  transformerId: string
  buses: LcsVoltageBus[]
}

export interface LoadCenter {
  id: string
  name: string
  voltage: LoadCenterVoltage | '440/230'
  local?: string
  dcp10Id?: string
  feedCircuit?: Circuit
  outlets: LcsOutlet[]
}

export interface AbtChain {
  abt: Equipment
  toTransformer: Circuit
  transformer: Equipment
  loadCenters: LoadCenter[]
  /** Modelo dual 440/230 si hay LCS importado */
  lcsBoard?: LcsBoardModel
}
