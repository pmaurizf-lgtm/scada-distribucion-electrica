/**
 * Carga y fusión de datos aguas abajo ABT (Excel 440/230) sin mutar system690.json.
 */

import type {
  Circuit,
  DistributionData,
  Equipment,
  EquipmentKind,
  LineType,
  ServiceClass,
} from '../types'
import raw from '../data/abtDownstream.json'

interface RawEq {
  id: string
  name: string
  kind: EquipmentKind
  local?: string | null
  dcp10Id?: string | null
  voltage?: string | null
  spare?: boolean
  virtual?: boolean
}

interface RawCircuit {
  id: string
  excelRow?: number | null
  circuitRef?: string | null
  name: string
  originId: string
  destinationId: string
  lineType: LineType
  service?: ServiceClass | null
  protectionName: string
  protectionModel?: string | null
  protectionCurrentA?: number | null
  pnKW?: number | null
  voltage?: string | null
  parallelCables?: number | null
  cableSection?: string | null
  spare?: boolean
  virtual?: boolean
  notes?: string | null
}

interface RawChain {
  abtId: string
  transformerId: string
  loadCenterId: string
  transformerName?: string
  loadCenterName?: string
  ratings?: {
    kVA?: string
    primaryV?: string
    secondary440V?: string
    secondary230V?: string
  }
}

type RawFile = {
  chains: RawChain[]
  equipment: RawEq[]
  circuits: RawCircuit[]
}

const file = raw as RawFile

export const abtDownstreamChainsMeta = file.chains

function cleanEq(e: RawEq): Equipment {
  const out: Equipment = {
    id: e.id,
    name: e.name,
    kind: e.kind,
  }
  if (e.local) out.local = e.local
  if (e.dcp10Id) out.dcp10Id = e.dcp10Id
  if (e.voltage) out.voltage = e.voltage.includes('V') ? e.voltage : `${e.voltage} V`
  if (e.spare) out.spare = true
  if (e.virtual) out.virtual = true
  return out
}

function cleanCircuit(c: RawCircuit): Circuit {
  const out: Circuit = {
    id: c.id,
    name: c.name,
    originId: c.originId,
    destinationId: c.destinationId,
    protectionName: c.protectionName,
    lineType: c.lineType,
  }
  if (c.circuitRef) out.circuitRef = c.circuitRef
  if (c.service) out.service = c.service
  if (c.protectionModel) out.protectionModel = c.protectionModel
  if (c.protectionCurrentA != null) out.protectionCurrentA = c.protectionCurrentA
  if (c.pnKW != null) out.pnKW = c.pnKW
  if (c.voltage) {
    out.voltage = c.voltage.includes('V') ? c.voltage : `${c.voltage} V`
  }
  if (c.parallelCables != null) out.parallelCables = c.parallelCables
  if (c.cableSection) out.cableSection = c.cableSection
  if (c.spare) out.spare = true
  if (c.virtual) out.virtual = true
  if (c.notes) out.notes = c.notes
  if (c.excelRow != null) out.excelRow = c.excelRow
  return out
}

/** Devanados secundarios TRF→LCS: no entran al grafo de energía (evitar saltar QVS). */
function isTrfWindingLink(c: RawCircuit): boolean {
  return (
    !!c.virtual &&
    c.originId.startsWith('TRF-') &&
    c.destinationId.startsWith('LCS-')
  )
}

/**
 * Añade equipos/circuitos 440-230 de ABT→TRF→LCS al dataset 690 V.
 * No modifica MSB ni filas ya existentes.
 */
export function mergeAbtDownstream(base: DistributionData): DistributionData {
  const haveEq = new Set(base.equipment.map((e) => e.id))
  const haveCirc = new Set(base.circuits.map((c) => c.id))
  const haveRef = new Set(
    base.circuits.map((c) => c.circuitRef).filter(Boolean) as string[],
  )

  const equipment = [
    ...base.equipment,
    ...file.equipment
      .filter((e) => !haveEq.has(e.id))
      .map(cleanEq),
  ]

  const circuits = [
    ...base.circuits,
    ...file.circuits
      .filter((c) => !isTrfWindingLink(c))
      .filter((c) => !haveCirc.has(c.id))
      .filter((c) => !c.circuitRef || !haveRef.has(c.circuitRef))
      .map(cleanCircuit),
  ]

  return { ...base, equipment, circuits }
}

export function windingNotesForTrf(trfId: string): string | undefined {
  const windings = file.circuits.filter(
    (c) => isTrfWindingLink(c) && c.originId === trfId,
  )
  if (windings.length === 0) return undefined
  const v440 = windings.filter((c) => String(c.voltage).startsWith('440')).length
  const v230 = windings.filter((c) => String(c.voltage).startsWith('230')).length
  return `Banco trifásico: ${v440} fases 440 V + ${v230} fases 230 V (Excel)`
}
