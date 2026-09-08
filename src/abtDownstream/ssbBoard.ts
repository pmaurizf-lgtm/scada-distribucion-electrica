/**
 * Cuadros secundarios SSB 440 V (aguas abajo LCS): interruptor de entrada + barra + salidas.
 */

import type { Circuit, DistributionData, Equipment } from '../types'

export const SSB_INCOMING_NOTE = 'ssb-incoming'

/** Barra interna 115 V tras TRF 440→115 (Q04 → TRF → Q04-01 → BUS → Q51…). */
export const SSB_115_BUS_NOTE = 'ssb-115-bus'

export function isInsProtectionName(name: string | undefined | null): boolean {
  return /^INS\s*\d{2,3}$/i.test(String(name ?? '').trim())
}

/** Excel «Incoming Power Switch»: INS xxx o NSX de cabecera. */
export function isSsbIncomingSwitchName(
  name: string | undefined | null,
): boolean {
  const s = String(name ?? '').trim()
  return isInsProtectionName(s) || /^NSX\b/i.test(s)
}

/** Circuito del interruptor de entrada del SSB (hacia BUS-SSB-…). */
export function isSsbIncomingCircuit(c: Circuit): boolean {
  return (
    c.notes === SSB_INCOMING_NOTE ||
    (c.destinationId.startsWith('BUS-') &&
      isSsbIncomingSwitchName(c.protectionName))
  )
}

/** Barra virtual interna `BUS-{boardId}` (aguas abajo del INS/NSX). */
export function internalBusId(boardId: string): string {
  return `BUS-${boardId}`
}

export function boardHasInternalBus(
  boardId: string,
  equipment: readonly Pick<Equipment, 'id'>[],
): boolean {
  const bus = internalBusId(boardId)
  return equipment.some((e) => e.id === bus)
}

/**
 * Señal de «origen vivo» para piernas de salida.
 * Si el cuadro tiene barra interna, solo cuenta esa barra (no el chasis
 * alimentado antes del INS). Sin barra, el propio cuadro.
 */
export function isOutletSideOriginLive(
  originId: string,
  energizedEquipmentIds: ReadonlySet<string>,
  equipment: readonly Pick<Equipment, 'id'>[],
): boolean {
  const bus = internalBusId(originId)
  if (equipment.some((e) => e.id === bus)) {
    return energizedEquipmentIds.has(bus)
  }
  return energizedEquipmentIds.has(originId)
}

/** Barra del cuadro viva (tras INS si existe). */
export function isInternalBusLive(
  boardId: string,
  energizedEquipmentIds: ReadonlySet<string>,
  equipment: readonly Pick<Equipment, 'id'>[],
  hasIncomingSwitch: boolean,
): boolean {
  if (boardHasInternalBus(boardId, equipment)) {
    return energizedEquipmentIds.has(internalBusId(boardId))
  }
  // Bus-only / sin BUS materializado: el cuadro es la barra.
  if (!hasIncomingSwitch) return energizedEquipmentIds.has(boardId)
  return false
}

/**
 * ¿Cuadro/panel 440 V con interior barra → salidas (sin INS de cabecera)?
 * CCM-VEMS, FAC-VENT, FCP/FUP/UCP-ACON. Excluye CCM-6PWS del MSB.
 */
export function isDownstreamPanelBoard(equipment: Equipment): boolean {
  const id = equipment.id
  if (/^CCM-6PWS/i.test(id)) return false
  return /^(CCM-|FAC-VENT|FAP-VENT|FCP-ACON|FUP-ACON|UCP-ACON)/i.test(id)
}

/** Cuadro con layout entrada/barra → salidas (SSB con INS/NSX, o panel 440 V). */
export function hasSsbBoardLayout(equipment: Equipment): boolean {
  if (isSsbIncomingSwitchName(equipment.incomingSwitch)) return true
  if (isDownstreamPanelBoard(equipment)) return true
  // Cuadros 400 Hz sin INS materializado: barra + salidas (bus-only).
  if (/^SSB-[12]SFS/i.test(equipment.id)) return true
  return false
}

/** Barra virtual 115 V interna de SSB especiales. */
export function isSsb115InternalBus(eq: Equipment): boolean {
  return Boolean(eq.virtual && /^BUS-SSB-.+-115$/i.test(eq.id))
}

export function isSsb115BusCircuit(c: Circuit): boolean {
  return (
    c.notes === SSB_115_BUS_NOTE ||
    /^BUS-SSB-.+-115$/i.test(c.destinationId)
  )
}

export function ssbIncomingCircuit(
  data: DistributionData,
  ssbId: string,
): Circuit | undefined {
  return data.circuits.find(
    (c) => c.originId === ssbId && isSsbIncomingCircuit(c),
  )
}

/**
 * ¿El modelo Excel es interruptor motorizado?
 * NSX/MTZ con operador M → sí; INS / NG125 / iC60 / NSX … NA → no.
 */
export function isMotorizedProtectionModel(
  model: string | undefined | null,
  protectionName?: string | undefined | null,
): boolean {
  if (isInsProtectionName(protectionName) || isInsProtectionName(model)) {
    return false
  }
  const m = String(model ?? '').trim()
  if (!m) return true // MSB sin modelo: motorizado por defecto
  if (/^INS\b/i.test(m)) return false
  if (/^(NG125|iC60|iC\s*60|C60)\b/i.test(m)) return false
  // NSX / MTZ con operador motorizado (… M2.2, M5.0 …)
  if (/\bM\d/i.test(m) || /\bM\.\d/i.test(m)) return true
  if (/^MTZ/i.test(m)) return true
  if (/^NSX\b/i.test(m) && !/\bNA\b/i.test(m)) return true
  return false
}
