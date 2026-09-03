/**
 * Tensión de circulación inferida del código PUMA / DCP-10.
 * Tras un RCT/TRF la denominación del cuadro aguas abajo indica el sistema:
 * 6PWS = 690 V · 4PWS = 440 V · 2PWS/2LGS/2ELG/2LGE = 230 V · 1PWS = 115 V · 24PW = 24 V · 4SFS/XSFS = 400 Hz.
 * `alum` = distribución de alumbrado (blanco) desde el INS del cuadro hacia abajo.
 */
import type { Circuit, Equipment } from '../types'
import { isAux24Feed, isMsb24Equipment } from './cascadeModel'
import { isSbtToScvDirectFeed } from '../voltageSystems/hz400'

export type FlowVoltage = '690' | '440' | '230' | '115' | '24' | '400hz' | 'alum'

/** Códigos PUMA de alumbrado normal / emergencia / exterior (+ cajas DDGG). */
export function isLightingBoardId(id: string): boolean {
  return (
    /(?:^|-)2(?:LGS|ELG|LGE)/i.test(id) || /^TBX-GENS[1-4]005$/i.test(id)
  )
}

/** Cuadro / caja / UPS de alumbrado (cables blancos bajo el INS). */
export function isLightingBoard(eq: Pick<Equipment, 'id' | 'name'>): boolean {
  if (isLightingBoardId(eq.id)) return true
  return /^(CUADRO SEC\. ALUMBRADO|CAJA DE ALUMBRADO|UPS ALUMBRADO)/i.test(
    eq.name,
  )
}

export function flowVoltageFromEquipmentId(id: string): FlowVoltage {
  const u = id.toUpperCase()
  if (/4SFS|XSFS/.test(u)) return '400hz'
  if (/24PW/.test(u)) return '24'
  if (/6PWS/.test(u)) return '690'
  if (/4PWS/.test(u)) return '440'
  /* 2PWS + alumbrado 2LGS / 2ELG / 2LGE → acometida 230 V (amarillo) */
  if (/2(?:PWS|LGS|ELG|LGE)/.test(u)) return '230'
  if (/1PWS/.test(u) || /-115$/i.test(id)) return '115'
  return '690'
}

/** Tensión declarada en el circuito (columna Excel / `circuit.voltage`). */
export function flowVoltageFromCircuitField(
  circuit: Circuit,
): FlowVoltage | null {
  const raw = circuit.voltage
  if (raw == null || raw === '') return null
  const v = String(raw).replace(/\s*V$/i, '').trim()
  if (v === '690') return '690'
  if (v.startsWith('440')) return '440'
  if (v.startsWith('230')) return '230'
  if (v.startsWith('115')) return '115'
  if (/400|hz/i.test(v)) return '400hz'
  if (v === '24') return '24'
  return null
}

/** Tensión de una acometida: prioriza `circuit.voltage`, luego destino/origen. */
export function flowVoltageFromCircuit(circuit: Circuit): FlowVoltage {
  if (isAux24Feed(circuit)) return '24'
  if (isMsb24Equipment(circuit.originId)) return '24'
  /* Salidas / INS→barra desde cuadro de alumbrado → blanco (no la acometida al cuadro). */
  if (isLightingBoardId(circuit.originId)) return 'alum'
  const fromField = flowVoltageFromCircuitField(circuit)
  if (fromField) return fromField
  if (isSbtToScvDirectFeed(circuit)) return '400hz'
  return flowVoltageFromEquipmentId(circuit.originId)
}

/** Acometida visible encima del INS: siempre 230 V en cuadros de alumbrado. */
export function dataFlowVoltageForBoardFeed(
  circuit: Circuit,
  board: Pick<Equipment, 'id' | 'name'>,
): { 'data-flow-v': FlowVoltage } {
  if (isLightingBoard(board)) return { 'data-flow-v': '230' }
  return dataFlowVoltageFromCircuit(circuit)
}

export function dataFlowVoltageAlum(): { 'data-flow-v': 'alum' } {
  return { 'data-flow-v': 'alum' }
}

/** Enlace SBT→SCV: conversión 690 V → 400 Hz (color aguas abajo). */
export function dataFlowVoltageForConversionLink(
  circuit: Circuit,
): { 'data-flow-v': FlowVoltage } {
  if (isSbtToScvDirectFeed(circuit)) return { 'data-flow-v': '400hz' }
  return dataFlowVoltageFromCircuit(circuit)
}

export function dataFlowVoltageFromCircuit(
  circuit: Circuit,
): { 'data-flow-v': FlowVoltage } {
  return { 'data-flow-v': flowVoltageFromCircuit(circuit) }
}

export function dataFlowVoltageProps(
  id: string,
): { 'data-flow-v': FlowVoltage } {
  return { 'data-flow-v': flowVoltageFromEquipmentId(id) }
}

/** LCS dual: tensión de la barra VS/VM/NV (440 o 230). */
export function dataFlowVoltageFromLcsBus(
  voltage: number | string,
): { 'data-flow-v': FlowVoltage } {
  const v = String(voltage)
  return { 'data-flow-v': v === '230' ? '230' : '440' }
}

/** Barra MSB-4SFS: 400 Hz en la sección 440, 115 V en la rama 115. */
export function dataFlowVoltageFor4SfsBus(
  bus: '440' | '115',
): { 'data-flow-v': FlowVoltage } {
  return { 'data-flow-v': bus === '115' ? '115' : '400hz' }
}
