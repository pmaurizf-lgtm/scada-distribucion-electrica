import type {
  Circuit,
  DistributionData,
  Equipment,
  EquipmentKind,
  LineType,
  ServiceClass,
} from '../types'
import raw from './system690.json'

interface RawEquipment {
  id: string
  name: string
  local?: string | null
  kind: EquipmentKind
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
  pKWe?: number | null
  qKVAr?: number | null
  sKVA?: number | null
  ibA?: number | null
  voltage?: number | null
  pnKW?: number | null
  parallelCables?: number
  virtual?: boolean
}

interface RawSystem {
  title: string
  vessel: string
  equipment: RawEquipment[]
  circuits: RawCircuit[]
}

const system = raw as RawSystem

export const system690: DistributionData = {
  title: system.title,
  vessel: system.vessel,
  equipment: system.equipment.map(
    (eq): Equipment => ({
      id: eq.id,
      name: eq.name,
      kind: eq.kind,
      local: eq.local || undefined,
      voltage: '690 V',
      virtual: eq.virtual,
    }),
  ),
  circuits: system.circuits.map(
    (c): Circuit => ({
      id: c.id,
      name: c.name,
      originId: c.originId,
      destinationId: c.destinationId,
      circuitRef: c.circuitRef || undefined,
      lineType: c.lineType,
      service: c.service ?? null,
      protectionName: c.protectionName,
      protectionModel: c.protectionModel || undefined,
      protectionCurrentA: c.protectionCurrentA ?? null,
      pKWe: c.pKWe ?? null,
      qKVAr: c.qKVAr ?? null,
      sKVA: c.sKVA ?? null,
      ibA: c.ibA ?? null,
      pnKW: c.pnKW ?? null,
      voltage: c.voltage != null ? `${c.voltage} V` : '690 V',
      parallelCables: c.parallelCables,
      virtual: c.virtual,
      excelRow: c.excelRow ?? null,
    }),
  ),
}
