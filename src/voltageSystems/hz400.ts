/**
 * Topología 400 Hz (MSB-4SFS / SCV / SSB-1SFS) sin tocar el MSB 690.
 */

import type { Circuit, DistributionData, Equipment } from '../types'

export function isMsb4Sfs(id: string): boolean {
  return /^MSB-4SFS/i.test(id)
}

export function isScv4Sfs(id: string): boolean {
  return /^SCV-4SFS/i.test(id)
}

export function isSbt6Pws(id: string): boolean {
  return /^SBT-6PWS/i.test(id)
}

/**
 * SBT → SCV: cable directo sin interruptor en el unifilar
 * (protección «—» en datos).
 */
export function isSbtToScvDirectFeed(circuit: Circuit): boolean {
  return (
    !circuit.virtual &&
    isSbt6Pws(circuit.originId) &&
    isScv4Sfs(circuit.destinationId)
  )
}

/**
 * SCV → MSB-4SFS: el cable del unifilar no lleva chip;
 * Q00 se pinta dentro del cuadro (entrada a barra), como QG en MSB-6PWS.
 */
export function isScvToMsb4SfsFeed(circuit: Circuit): boolean {
  return (
    !circuit.virtual &&
    isScv4Sfs(circuit.originId) &&
    isMsb4Sfs(circuit.destinationId)
  )
}

/**
 * Lado del bus-tie Q01/Q51: siempre a estribor (derecha), igual que
 * MSB-4SFS0001 — el cartel INTERCONEXION queda fuera del rack.
 */
export function msb4SfsTieSide(_msbId: string): 'left' | 'right' {
  return 'right'
}

export function isSsb1SfsFamily(id: string): boolean {
  return /^SSB-[12]SFS/i.test(id)
}

export function isHz400Circuit(c: Circuit): boolean {
  return (
    c.notes === 'hz400' ||
    isMsb4Sfs(c.originId) ||
    isMsb4Sfs(c.destinationId) ||
    isScv4Sfs(c.originId) ||
    isScv4Sfs(c.destinationId)
  )
}

/** Acoplador entre MSB-4SFS (Q01 440 / Q51 115). */
export function isMsb4SfsInterconnect(c: Circuit): boolean {
  return (
    !c.virtual &&
    isMsb4Sfs(c.originId) &&
    isMsb4Sfs(c.destinationId) &&
    c.originId !== c.destinationId
  )
}

/**
 * Retorno del transformador 400 Hz a la barra 115 del mismo MSB
 * (p. ej. TRF-1SFS0001 → MSB-4SFS0001 Q50).
 */
export function isMsb4SfsTrfReturn(c: Circuit): boolean {
  return (
    !c.virtual &&
    /^TRF-[124]SFS/i.test(c.originId) &&
    isMsb4Sfs(c.destinationId)
  )
}

/**
 * Salida de barra 440 al TRF que devuelve 115 al mismo MSB (Q09…).
 * No se pinta como drop colgante: va en el puente 440→TRF→Q50→115.
 */
export function isMsb4SfsTrfPrimaryOutlet(
  c: Circuit,
  data: DistributionData,
): boolean {
  if (
    c.virtual ||
    !isMsb4Sfs(c.originId) ||
    !/^TRF-[124]SFS/i.test(c.destinationId)
  ) {
    return false
  }
  return data.circuits.some(
    (r) =>
      isMsb4SfsTrfReturn(r) &&
      r.originId === c.destinationId &&
      r.destinationId === c.originId,
  )
}

export type Msb4SfsBusVoltage = '440' | '115'

export function msb4SfsOutletVoltage(c: Circuit): Msb4SfsBusVoltage {
  const v = String(c.voltage ?? '').replace(/\s*V$/i, '')
  if (v.startsWith('115') || /^Q5\d/i.test(c.protectionName)) return '115'
  return '440'
}

export function msb4SfsOutlets(
  data: DistributionData,
  msbId: string,
  bus: Msb4SfsBusVoltage,
): { circuit: Circuit; equipment: Equipment }[] {
  return data.circuits
    .filter(
      (c) =>
        !c.virtual &&
        c.originId === msbId &&
        !c.destinationId.startsWith('BUS-') &&
        !isMsb4SfsInterconnect(c) &&
        !isMsb4SfsTrfReturn(c) &&
        !isMsb4SfsTrfPrimaryOutlet(c, data) &&
        msb4SfsOutletVoltage(c) === bus,
    )
    .map((c) => ({
      circuit: c,
      equipment: data.equipment.find((e) => e.id === c.destinationId)!,
    }))
    .filter((x) => x.equipment && !x.equipment.virtual)
    .sort((a, b) =>
      a.circuit.protectionName.localeCompare(
        b.circuit.protectionName,
        undefined,
        { numeric: true },
      ),
    )
}

export function msb4SfsInterconnects(
  data: DistributionData,
  msbId: string,
  bus?: Msb4SfsBusVoltage,
): Circuit[] {
  return data.circuits.filter(
    (c) =>
      isMsb4SfsInterconnect(c) &&
      c.originId === msbId &&
      (bus == null || msb4SfsOutletVoltage(c) === bus),
  )
}

/** Alimentación 115 V del MSB vía TRF (retorno Q50…). */
export function msb4SfsTrfReturnFeed(
  data: DistributionData,
  msbId: string,
): Circuit | undefined {
  return data.circuits.find(
    (c) => isMsb4SfsTrfReturn(c) && c.destinationId === msbId,
  )
}

/** Salida 440 V del MSB hacia el TRF que retorna a 115 (Q09…). */
export function msb4SfsTrfPrimaryFeed(
  data: DistributionData,
  msbId: string,
): Circuit | undefined {
  const ret = msb4SfsTrfReturnFeed(data, msbId)
  if (!ret) return undefined
  return data.circuits.find(
    (c) =>
      !c.virtual &&
      c.originId === msbId &&
      c.destinationId === ret.originId,
  )
}
