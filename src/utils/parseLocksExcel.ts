/**
 * Excel LOTO / candados (p. ej. «Prueba 1 candados.xlsx»).
 *
 * Columnas clave:
 *  - D INTERRUPTOR (p. ej. CCM-6PWS0009-06, MSB-…-Q2B01-A)
 *  - E INTERRUPTOR NOMBRE CORTO
 *  - F EQUIPO SIT.CANDADO (CCM / panel)
 *  - G LOCAL
 *  - L Nº CANDADO
 *  - N COMENTARIO → en CCM el nombre real del polo (41Q1, 8Q1_CANDADO CERRADO…)
 */
import * as XLSX from 'xlsx'
import type { Circuit, DistributionData, Equipment } from '../types'
import { incomingFeeds } from './cascadeModel'
import { looksLikeEquipmentId } from '../startupFeeds/parseDestinationsExcel'
import { findEquipmentByQuery } from './upstream'

const MAX_LOCK_SHEET_CELLS = 200_000
const MAX_LOCK_TOKENS = 2_500
const MAX_LOCK_TARGETS = 3_000

export type CircuitLockInfo = {
  lockNumber: string
  interruptor: string
  shortName?: string
  siteEquipment?: string
  local?: string
  /** Texto col. N (polo CCM u otros comentarios). */
  comment?: string
}

export type LockExcelEntry = {
  interruptor: string
  shortName?: string
  siteEquipment?: string
  local?: string
  lockNumber: string
  comment?: string
}

function cellStr(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s || null
}

/** Quita sufijos de polo Excel (-A/-B/-C/-D) y restos tras `_`. */
function normalizeInterruptorRef(raw: string): string[] {
  const base = raw.trim()
  const out = new Set<string>([base])
  const noPole = base.replace(/-[A-D]$/i, '')
  if (noPole !== base) out.add(noPole)
  const beforeUs = base.split('_')[0]!.trim()
  if (beforeUs && beforeUs !== base) {
    out.add(beforeUs)
    out.add(beforeUs.replace(/-[A-D]$/i, ''))
  }
  return [...out]
}

function normalizeProtLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.split('_')[0]!.trim()
  return s || null
}

/**
 * Parsea filas del formato LOTO (cabecera con INTERRUPTOR / Nº CANDADO).
 * Si no reconoce cabeceras, devuelve [].
 */
export function parseLockEntriesFromWorkbook(
  data: ArrayBuffer,
): LockExcelEntry[] {
  const wb = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | null)[][]

  if (rows.length > MAX_LOCK_SHEET_CELLS) return []
  if (rows.length < 2) return []

  const header = (rows[0] ?? []).map((c) =>
    String(c ?? '')
      .trim()
      .toUpperCase(),
  )
  const colD = header.findIndex((h) => h.includes('INTERRUPTOR') && !h.includes('CORTO'))
  const colE = header.findIndex((h) => h.includes('NOMBRE CORTO'))
  const colF = header.findIndex((h) => h.includes('EQUIPO SIT') || h.includes('SIT.CANDADO'))
  const colG = header.findIndex((h) => h.includes('LOCAL'))
  const colL = header.findIndex((h) => h.includes('CANDADO') && h.includes('N'))
  const colN = header.findIndex((h) => h === 'COMENTARIO' || h.includes('COMENTARIO'))

  // Fallback posiciones fijas del Excel de prueba (0-based): D=3, E=4, F=5, G=6, L=11, N=13
  const iD = colD >= 0 ? colD : 3
  const iE = colE >= 0 ? colE : 4
  const iF = colF >= 0 ? colF : 5
  const iG = colG >= 0 ? colG : 6
  const iL = colL >= 0 ? colL : 11
  const iN = colN >= 0 ? colN : 13

  const firstInterruptor = cellStr(rows[1]?.[iD])
  if (!firstInterruptor || !/^[A-Z0-9]/i.test(firstInterruptor)) {
    return []
  }

  const out: LockExcelEntry[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const interruptor = cellStr(row[iD])
    if (!interruptor) continue
    const lockNumber = cellStr(row[iL])
    if (!lockNumber) continue
    out.push({
      interruptor,
      shortName: cellStr(row[iE]) ?? undefined,
      siteEquipment: cellStr(row[iF]) ?? undefined,
      local: cellStr(row[iG]) ?? undefined,
      lockNumber,
      comment: cellStr(row[iN]) ?? undefined,
    })
    if (out.length >= MAX_LOCK_TARGETS) break
  }
  return out
}

/** Extrae tokens candidatas (IDs) de la 1ª hoja — compat. listas planas. */
export function parseLockTargetsFromWorkbook(data: ArrayBuffer): string[] {
  const structured = parseLockEntriesFromWorkbook(data)
  if (structured.length > 0) {
    return structured.map((e) => e.interruptor)
  }

  const wb = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | null)[][]

  if (rows.length > MAX_LOCK_SHEET_CELLS) return []

  const seen = new Set<string>()
  const out: string[] = []

  for (const row of rows) {
    if (!row) continue
    for (const cell of row) {
      if (cell == null) continue
      const text = String(cell).trim()
      if (!text) continue
      if (
        !looksLikeEquipmentId(text) &&
        !/^[A-Z0-9][-A-Z0-9._]{3,}$/i.test(text)
      ) {
        continue
      }
      const key = text.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(text)
      if (out.length >= MAX_LOCK_TOKENS) return out
    }
  }
  return out
}

function findCircuitByRefOrProt(
  circuits: Circuit[],
  candidates: string[],
): Circuit | undefined {
  for (const q of candidates) {
    const ql = q.toLowerCase()
    const hit = circuits.find(
      (c) =>
        !c.virtual &&
        (c.id.toLowerCase() === ql ||
          (c.circuitRef && c.circuitRef.toLowerCase() === ql) ||
          c.protectionName.toLowerCase() === ql),
    )
    if (hit) return hit
  }
  return undefined
}

/**
 * Resuelve filas LOTO → circuitId + meta (nº candado).
 * CCM: cruza D (CCM-…-NN) con N (41Q1) / F (CCM-…).
 */
export function resolveLockEntries(
  data: DistributionData,
  entries: LockExcelEntry[],
  equipmentPool?: Equipment[],
): { locks: Record<string, CircuitLockInfo>; unresolved: string[] } {
  const circuits = data.circuits.filter((c) => !c.virtual)
  const pool =
    equipmentPool ??
    data.equipment.filter(
      (e) =>
        !e.virtual &&
        !e.id.startsWith('BUS-') &&
        !e.id.startsWith('SPARE-') &&
        e.id !== 'ORIGEN-PENDIENTE',
    )

  const locks: Record<string, CircuitLockInfo> = {}
  const unresolved: string[] = []

  for (const entry of entries) {
    const candidates = normalizeInterruptorRef(entry.interruptor)
    let circuit = findCircuitByRefOrProt(circuits, candidates)

    // CCM: D = CCM-6PWS0009-06, N = 41Q1 (o 8Q1_CANDADO CERRADO)
    if (!circuit && /^CCM-/i.test(entry.interruptor)) {
      const ccmId =
        entry.siteEquipment ||
        entry.interruptor.replace(/-\d+$/i, '') ||
        null
      const prot = normalizeProtLabel(entry.comment)
      if (ccmId && prot) {
        circuit = circuits.find(
          (c) =>
            c.originId.toUpperCase() === ccmId.toUpperCase() &&
            c.protectionName.toLowerCase() === prot.toLowerCase(),
        )
      }
      if (!circuit && ccmId && entry.shortName) {
        const suf = entry.shortName.replace(/^0+/, '') || entry.shortName
        circuit = circuits.find(
          (c) =>
            c.originId.toUpperCase() === ccmId.toUpperCase() &&
            (c.circuitRef || '').toUpperCase() ===
              `${ccmId}-${entry.shortName}`.toUpperCase(),
        )
        if (!circuit) {
          circuit = circuits.find(
            (c) =>
              c.originId.toUpperCase() === ccmId.toUpperCase() &&
              (c.circuitRef || '').toUpperCase().endsWith(`-${suf}`),
          )
        }
      }
    }

    // Comentario tipo LCS-4PWS0004-2Q01_CANDADO…
    if (!circuit && entry.comment) {
      const fromComment = normalizeInterruptorRef(
        entry.comment.replace(/_CANDADO.*$/i, ''),
      )
      circuit = findCircuitByRefOrProt(circuits, fromComment)
    }

    if (!circuit) {
      const eq = findEquipmentByQuery(pool, entry.interruptor)
      if (eq) {
        const incoming = incomingFeeds(data, eq.id)
        circuit = incoming[0]
      }
    }

    if (!circuit) {
      unresolved.push(entry.interruptor)
      continue
    }

    locks[circuit.id] = {
      lockNumber: entry.lockNumber,
      interruptor: entry.interruptor,
      shortName: entry.shortName,
      siteEquipment: entry.siteEquipment,
      local: entry.local,
      comment: entry.comment,
    }
  }

  return { locks, unresolved }
}

/**
 * Resuelve cada token a circuitIds a candar (listas planas / compat).
 */
export function resolveLockCircuitIds(
  data: DistributionData,
  targets: string[],
  equipmentPool?: Equipment[],
): { circuitIds: string[]; unresolved: string[] } {
  const normalizedTargets =
    targets.length > MAX_LOCK_TARGETS ? targets.slice(0, MAX_LOCK_TARGETS) : targets

  const entries: LockExcelEntry[] = normalizedTargets.map((t) => ({
    interruptor: t,
    lockNumber: '—',
  }))
  const { locks, unresolved } = resolveLockEntries(
    data,
    entries,
    equipmentPool,
  )
  return { circuitIds: Object.keys(locks), unresolved }
}

/** Aplica meta de candados y abre protecciones. */
export function applyLocksToProtectionStatus(
  base: Record<string, 'abierta' | 'cerrada'>,
  circuitIds: string[],
): Record<string, 'abierta' | 'cerrada'> {
  const next = { ...base }
  for (const id of circuitIds) next[id] = 'abierta'
  return next
}
