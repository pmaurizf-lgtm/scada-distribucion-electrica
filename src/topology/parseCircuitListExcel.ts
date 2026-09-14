/**
 * Parser en navegador de la «lista de circuitos» (.xlsx / .xlsm).
 * Misma columna base que system690.json notes.mapping + hojas de potencia.
 * No persiste nada: solo construye DistributionData en memoria.
 */
import * as XLSX from 'xlsx'
import type {
  Circuit,
  DistributionData,
  Equipment,
  EquipmentKind,
  LineType,
  ServiceClass,
} from '../types'
import { embeddedSystem690 } from '../data/system690'
import { AUX_24_NOTE, hasPowerVoltageFeed } from '../utils/cascadeModel'
import { augmentSpareCircuits } from '../utils/spareCircuits'

const MAX_CELLS = 2_500_000
const INS_NOTE = 'ssb-incoming'
const HZ400_NOTE = 'hz400'

/** Índices 0-based (A=0). */
const COL = {
  circuitRef: 3, // D
  originId: 4, // E
  originDcp10: 5, // F
  originLocal: 6, // G
  originDesc: 7, // H
  destinationId: 8, // I
  destinationDcp10: 9, // J
  destinationLocal: 10, // K
  destinationDesc: 11, // L
  sourceType: 12, // M
  service: 13, // N
  pnKW: 14, // O
  voltageNom: 16, // Q (400 Hz / algunas hojas)
  cableType: 22, // W
  parallelCables: 23, // X
  cableSection: 24, // Y
  cableLengthEstM: 25, // Z
  cableLengthForcM: 26, // AA
  cableLengthRouteM: 27, // AB
  cableLengthRealM: 28, // AC
  breakerId: 29, // AD
  breakerType: 30, // AE
  breakerInA: 31, // AF
  pKWe: 35, // AJ
  qKVAr: 36, // AK
  sKVA: 37, // AL
  ibA: 38, // AM
  cableWeightKg: 57, // BF
} as const

export type CircuitListImportStats = {
  sheetsUsed: string[]
  circuits: number
  equipment: number
  virtualKept: number
  skippedRows: number
  incomingSwitches: number
}

export type CircuitListImportResult = {
  data: DistributionData
  stats: CircuitListImportStats
}

function cellStr(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const s = String(v).trim()
  if (
    !s ||
    s === 'NaN' ||
    s === '#N/A' ||
    s === '#¡VALOR!' ||
    s === '#VALUE!' ||
    s === '-'
  ) {
    return null
  }
  return s
}

function cellNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

function round6(v: number | null): number | null {
  if (v == null) return null
  return Math.round(v * 1e6) / 1e6
}

function isPuma(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^[A-Z]{2,}-/i.test(v)
}

function isRespeto(dest: string | null, desc: string | null): boolean {
  if (!isPuma(dest)) return true
  const d = (desc ?? '').toUpperCase().trim()
  return (
    d === 'RESPETO' ||
    d.startsWith('RESPETO ') ||
    d === 'SPARE' ||
    d.startsWith('SPARE ')
  )
}

function kindOf(id: string, desc: string | null): EquipmentKind {
  if (id.startsWith('BUS-') || id.startsWith('SPARE-')) return 'consumidor'
  if (/^G[A-Z]?-|^DG-|^SDG-/i.test(id)) return 'generador'
  if (/^TRF-|^SCV-|^RCT-|^UPS-/i.test(id)) return 'conversion'
  if (/^MSB-/i.test(id)) return 'cuadro_principal'
  if (
    /^(SSB|ABT|LCS|CCM|CSB|FAC|FCP|FUP|UCP|FAP|SBT|PNL|TBX|JBX|FIU|CTP)-/i.test(
      id,
    )
  ) {
    return 'cuadro_secundario'
  }
  const d = (desc ?? '').toUpperCase()
  if (
    d.includes('CUADRO') ||
    d.includes('CENTRO DE CARGA') ||
    d.includes('RECTIFICADOR') ||
    d.includes('TRANSFORMADOR')
  ) {
    return 'cuadro_secundario'
  }
  return 'consumidor'
}

function serviceOf(v: string | null): ServiceClass | null {
  if (!v) return null
  const s = v.toUpperCase().trim()
  if (s === 'VM' || s === 'VS' || s === 'NV') return s
  return null
}

function lineTypeOf(v: string | null, service: ServiceClass | null): LineType {
  const s = (v ?? '').toLowerCase()
  if (s.includes('alt')) return 'alternativa'
  if (service === 'NV' && (!v || v === '-')) return 'alternativa'
  return 'normal'
}

function isIncomingSwitchName(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.toUpperCase().trim()
  return (
    /^INS\b/.test(n) ||
    /^NSX\b/.test(n) ||
    n.startsWith('INS ') ||
    n.includes(' INCOMING')
  )
}

function parseInsRating(name: string): number | null {
  const m = name.match(/(\d{2,4})\s*(A)?\b/i)
  return m ? Number(m[1]) : null
}

function protectionSuffixFromRef(circuitRef: string): string | null {
  const parts = circuitRef.split('-')
  const last = parts[parts.length - 1]?.trim()
  return last || null
}

function sheetMeta(sheetName: string): {
  voltage: string
  notes?: string
  preferColQ: boolean
} {
  const n = sheetName.toLowerCase()
  if (n.includes('400')) {
    return { voltage: '400Hz', notes: HZ400_NOTE, preferColQ: true }
  }
  if (/\b24\b/.test(n) || n.includes('24v') || n.includes('24 v')) {
    return { voltage: '24 V', preferColQ: false }
  }
  if (n.includes('690')) return { voltage: '690 V', preferColQ: false }
  if (n.includes('440')) return { voltage: '440 V', preferColQ: false }
  if (n.includes('115')) return { voltage: '115 V', preferColQ: false }
  if (n.includes('230')) return { voltage: '230 V', preferColQ: false }
  if (n.includes('light') || n.includes('alum')) {
    return { voltage: '230 V', preferColQ: false }
  }
  return { voltage: '230 V', preferColQ: false }
}

function voltageLabel(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  const s = raw.replace(/\s+/g, ' ').trim()
  if (/hz/i.test(s) || /400/.test(s)) {
    const num = s.match(/(\d+)/)?.[1]
    if (num === '115') return '115 V'
    if (num === '440') return '440 V'
    if (num === '200') return '200 V'
    return '400Hz'
  }
  if (/^\d+(\.\d+)?$/.test(s)) return `${s} V`
  if (/\d/.test(s) && /v/i.test(s)) return s.replace(/\s*V\s*$/i, '') + ' V'
  return fallback
}

function looksLikePowerSheet(name: string, sampleRows: unknown[][]): boolean {
  const n = name.toLowerCase()
  if (
    /power\s*system|690|440|230|24\s*v|24v|400\s*hz|lighting|alumbrado|lista/i.test(
      n,
    )
  ) {
    return true
  }
  for (const row of sampleRows.slice(0, 40)) {
    if (!row) continue
    const origin = cellStr(row[COL.originId])
    const dest = cellStr(row[COL.destinationId])
    if (isPuma(origin) && (isPuma(dest) || cellStr(row[COL.circuitRef]))) {
      return true
    }
  }
  return false
}

function cableLengthM(row: unknown[]): number | null {
  return (
    round6(cellNum(row[COL.cableLengthRealM])) ??
    round6(cellNum(row[COL.cableLengthRouteM])) ??
    round6(cellNum(row[COL.cableLengthForcM])) ??
    round6(cellNum(row[COL.cableLengthEstM]))
  )
}

/**
 * Lee el Excel de lista de circuitos y construye topología de sesión.
 * Conserva nodos/enlaces virtuales del unifilar embebido (barras MSB, etc.)
 * cuando siguen teniendo sentido.
 */
export function parseCircuitListExcel(
  data: ArrayBuffer,
  fileName: string,
): CircuitListImportResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: false })
  let cellCount = 0
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet || !sheet['!ref']) continue
    const range = XLSX.utils.decode_range(sheet['!ref'])
    cellCount += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1)
    if (cellCount > MAX_CELLS) {
      throw new Error(
        'El Excel es demasiado grande para cargarlo en el navegador.',
      )
    }
  }

  const eqById = new Map<string, Equipment>()
  const circuits: Circuit[] = []
  const circuitKeys = new Set<string>()
  const sheetsUsed: string[] = []
  let skippedRows = 0
  let seq = 1
  let incomingSwitches = 0

  const ensureEq = (
    id: string,
    patch: Partial<Equipment> & { name?: string },
  ): Equipment => {
    const prev = eqById.get(id)
    if (prev) {
      if (patch.name && (!prev.name || prev.name === prev.id)) {
        prev.name = patch.name
      }
      if (patch.local && !prev.local) prev.local = patch.local
      if (patch.dcp10Id && !prev.dcp10Id) prev.dcp10Id = patch.dcp10Id
      if (patch.voltage && !prev.voltage) prev.voltage = patch.voltage
      if (patch.incomingSwitch) prev.incomingSwitch = patch.incomingSwitch
      if (patch.spare) prev.spare = true
      if (patch.kind && prev.kind === 'consumidor') prev.kind = patch.kind
      return prev
    }
    const eq: Equipment = {
      id,
      name: patch.name || id,
      kind: patch.kind ?? kindOf(id, patch.name ?? null),
      local: patch.local,
      voltage: patch.voltage,
      dcp10Id: patch.dcp10Id ?? id,
      spare: patch.spare,
      virtual: patch.virtual,
      incomingSwitch: patch.incomingSwitch,
    }
    eqById.set(id, eq)
    return eq
  }

  const addCircuit = (c: Circuit): boolean => {
    const key = `${c.originId}|${c.protectionName}|${c.destinationId}|${c.circuitRef ?? ''}`
    const soft = `${c.originId}|${c.protectionName}|${c.destinationId}`
    if (circuitKeys.has(key) || circuitKeys.has(soft)) return false
    circuitKeys.add(key)
    circuitKeys.add(soft)
    circuits.push(c)
    return true
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    })
    if (!looksLikePowerSheet(sheetName, rows)) continue

    const meta = sheetMeta(sheetName)
    sheetsUsed.push(sheetName)
    const insByBoard = new Map<
      string,
      { name: string; excelRow: number }
    >()

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length < 9) continue

      const originProbe = cellStr(row[COL.originId])
      const next = cellStr(row[COL.originDcp10])
      // Filas «Incoming Power Switch:» (E=etiqueta, F=valor, origen en B u otra)
      if (
        originProbe?.toLowerCase().includes('incoming power switch') ||
        originProbe === 'Incoming Power Switch:'
      ) {
        const board =
          cellStr(row[1]) || // B
          cellStr(row[0]) ||
          cellStr(row[COL.destinationId])
        const insName = next || cellStr(row[COL.originDesc])
        if (isPuma(board) && isIncomingSwitchName(insName)) {
          insByBoard.set(board, { name: insName!, excelRow: r + 1 })
        }
        continue
      }
    }

    for (const [boardId, ins] of insByBoard) {
      if (!isIncomingSwitchName(ins.name)) continue
      incomingSwitches++
      const busId = `BUS-${boardId}`
      ensureEq(boardId, {
        kind: 'cuadro_secundario',
        voltage: meta.voltage,
        incomingSwitch: ins.name,
      })
      ensureEq(busId, {
        name: `Barra ${boardId}`,
        kind: 'cuadro_secundario',
        voltage: meta.voltage,
        virtual: true,
      })
      addCircuit({
        id: `xls-ins-${String(seq++).padStart(4, '0')}`,
        excelRow: ins.excelRow,
        circuitRef: `${boardId}-${ins.name.replace(/\s+/g, '')}`,
        name: `${boardId} → ${busId}`,
        originId: boardId,
        destinationId: busId,
        lineType: 'normal',
        service: 'VS',
        protectionName: ins.name,
        protectionModel: ins.name,
        protectionCurrentA: parseInsRating(ins.name),
        voltage: meta.voltage,
        spare: false,
        virtual: false,
        notes: INS_NOTE,
      })
    }

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length < 9) continue

      const circuitRef = cellStr(row[COL.circuitRef])
      const originId = cellStr(row[COL.originId])
      if (!circuitRef || !isPuma(originId)) {
        skippedRows++
        continue
      }
      if (originId.toLowerCase().includes('incoming')) {
        skippedRows++
        continue
      }

      const destRaw = cellStr(row[COL.destinationId])
      const destDesc = cellStr(row[COL.destinationDesc])
      const spare = isRespeto(destRaw, destDesc)
      let destinationId: string
      if (spare) {
        const brk =
          cellStr(row[COL.breakerId]) || circuitRef.split('-').pop() || 'X'
        destinationId = `SPARE-${originId}-${String(brk).replace(/[^A-Za-z0-9-]/g, '')}`
      } else if (isPuma(destRaw)) {
        destinationId = destRaw
      } else {
        skippedRows++
        continue
      }

      const service = serviceOf(cellStr(row[COL.service]))
      const lineType = lineTypeOf(cellStr(row[COL.sourceType]), service)
      const protFromRef = protectionSuffixFromRef(circuitRef)
      const adRaw = cellStr(row[COL.breakerId])
      const adLooksBreaker =
        !!adRaw &&
        !/^\d+([.,]\d+)?$/.test(adRaw) &&
        !/^NaN$/i.test(adRaw)
      const protectionName =
        (adLooksBreaker ? adRaw : null) || protFromRef || '?'

      let voltage = meta.voltage
      if (meta.preferColQ) {
        voltage = voltageLabel(cellStr(row[COL.voltageNom]), meta.voltage)
      }

      const originDesc = cellStr(row[COL.originDesc])
      const originLocal = cellStr(row[COL.originLocal])
      const originDcp = cellStr(row[COL.originDcp10])
      const destLocal = cellStr(row[COL.destinationLocal])
      const destDcp = cellStr(row[COL.destinationDcp10])

      ensureEq(originId, {
        name: originDesc || originId,
        local: originLocal || undefined,
        dcp10Id: originDcp || originId,
        voltage,
        kind: kindOf(originId, originDesc),
      })
      ensureEq(destinationId, {
        name: spare ? destDesc || 'RESPETO' : destDesc || destinationId,
        local: destLocal || undefined,
        dcp10Id: destDcp || destinationId,
        voltage,
        kind: kindOf(destinationId, destDesc),
        spare: spare || undefined,
      })

      // Si el cuadro tiene INS, las salidas cuelgan de la barra virtual.
      let feedOrigin = originId
      if (insByBoard.has(originId) && eqById.has(`BUS-${originId}`)) {
        feedOrigin = `BUS-${originId}`
      }

      const ok = addCircuit({
        id: `xls-${String(seq++).padStart(5, '0')}`,
        excelRow: r + 1,
        circuitRef,
        name: `${feedOrigin} → ${destinationId}`,
        originId: feedOrigin,
        destinationId,
        lineType,
        service,
        protectionName,
        protectionModel: cellStr(row[COL.breakerType]) || undefined,
        protectionCurrentA: cellNum(row[COL.breakerInA]),
        pKWe: round6(cellNum(row[COL.pKWe])),
        qKVAr: round6(cellNum(row[COL.qKVAr])),
        sKVA: round6(cellNum(row[COL.sKVA])),
        ibA: round6(cellNum(row[COL.ibA])),
        pnKW: round6(cellNum(row[COL.pnKW])),
        voltage,
        parallelCables: cellNum(row[COL.parallelCables]) ?? undefined,
        cableSection: cellStr(row[COL.cableSection]) || undefined,
        cableType: cellStr(row[COL.cableType]) || undefined,
        cableLengthM: cableLengthM(row),
        cableWeightKg: round6(cellNum(row[COL.cableWeightKg])),
        spare: spare || undefined,
        notes: meta.notes,
      })
      if (!ok) skippedRows++
    }
  }

  if (!circuits.length) {
    throw new Error(
      'No se encontraron circuitos en el Excel. ¿Es la lista de circuitos del unifilar?',
    )
  }

  // Conservar estructura virtual embebida (barras MSB, paneles, etc.).
  let virtualKept = 0
  for (const eq of embeddedSystem690.equipment) {
    if (!eq.virtual) continue
    if (eqById.has(eq.id)) continue
    // Mantener virtuales MSB / paneles / barras genéricas
    if (
      /^MSB-|^PNL-MSB|^BUS-/i.test(eq.id) ||
      eq.id.includes('SB') ||
      eq.id.includes('SA')
    ) {
      eqById.set(eq.id, { ...eq })
      virtualKept++
    }
  }
  for (const c of embeddedSystem690.circuits) {
    if (!c.virtual) continue
    if (!eqById.has(c.originId) || !eqById.has(c.destinationId)) continue
    if (addCircuit({ ...c, id: `virt-${c.id}` })) virtualKept++
  }

  // AUX 24 V: 24 V a equipo que también tiene potencia.
  const provisional: DistributionData = {
    title: 'Lista de circuitos (sesión)',
    vessel: embeddedSystem690.vessel,
    sourceFile: fileName,
    equipment: [...eqById.values()],
    circuits,
  }
  for (const c of provisional.circuits) {
    if (c.notes === AUX_24_NOTE || c.notes === INS_NOTE) continue
    const v = String(c.voltage ?? '')
    if (!v.startsWith('24')) continue
    if (hasPowerVoltageFeed(provisional, c.destinationId, c.id)) {
      c.notes = AUX_24_NOTE
    }
  }

  const withSpares = augmentSpareCircuits(provisional)

  return {
    data: withSpares,
    stats: {
      sheetsUsed,
      circuits: withSpares.circuits.length,
      equipment: withSpares.equipment.length,
      virtualKept,
      skippedRows,
      incomingSwitches,
    },
  }
}
