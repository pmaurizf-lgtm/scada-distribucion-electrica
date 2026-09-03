/**
 * Excel de candados: lista de equipos (PUMA / DCP-10) o circuitos a bloquear.
 * Reutiliza el criterio de IDs del informe de alimentaciones.
 */
import * as XLSX from 'xlsx'
import type { DistributionData, Equipment } from '../types'
import { incomingFeeds } from './cascadeModel'
import { looksLikeEquipmentId } from '../startupFeeds/parseDestinationsExcel'
import { findEquipmentByQuery } from './upstream'

const MAX_LOCK_SHEET_CELLS = 200_000
const MAX_LOCK_TOKENS = 2_500
const MAX_LOCK_TARGETS = 3_000

/** Extrae tokens candidatas (IDs) de la 1ª hoja. */
export function parseLockTargetsFromWorkbook(data: ArrayBuffer): string[] {
  const wb = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | null)[][]

  // Guardrail: evita procesar hojas absurdas que pueden congelar el navegador.
  // (sheet_to_json ya materializa toda la matriz, así que limitamos tokens/retorno pronto.)
  if (rows.length > MAX_LOCK_SHEET_CELLS) return []

  const seen = new Set<string>()
  const out: string[] = []

  for (const row of rows) {
    if (!row) continue
    for (const cell of row) {
      if (cell == null) continue
      const text = String(cell).trim()
      if (!text) continue
      // ID de equipo o código de circuito / protección
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

/**
 * Resuelve cada token a circuitIds a candar:
 * — circuitId / circuitRef / protectionName exactos
 * — equipo → alimentaciones entrantes (destino = equipo)
 */
export function resolveLockCircuitIds(
  data: DistributionData,
  targets: string[],
  equipmentPool?: Equipment[],
): { circuitIds: string[]; unresolved: string[] } {
  const normalizedTargets =
    targets.length > MAX_LOCK_TARGETS ? targets.slice(0, MAX_LOCK_TARGETS) : targets

  const pool =
    equipmentPool ??
    data.equipment.filter(
      (e) =>
        !e.virtual &&
        !e.id.startsWith('BUS-') &&
        !e.id.startsWith('SPARE-') &&
        e.id !== 'ORIGEN-PENDIENTE',
    )

  const circuitIds = new Set<string>()
  const unresolved: string[] = []

  for (const raw of normalizedTargets) {
    const q = raw.trim()
    if (!q) continue

    const asCircuit = data.circuits.find(
      (c) =>
        !c.virtual &&
        (c.id === q ||
          c.id.toLowerCase() === q.toLowerCase() ||
          (c.circuitRef && c.circuitRef.toLowerCase() === q.toLowerCase()) ||
          c.protectionName.toLowerCase() === q.toLowerCase()),
    )
    if (asCircuit) {
      circuitIds.add(asCircuit.id)
      continue
    }

    const eq = findEquipmentByQuery(pool, q)
    if (!eq) {
      unresolved.push(q)
      continue
    }

    const incoming = incomingFeeds(data, eq.id)
    if (incoming.length === 0) {
      unresolved.push(q)
      continue
    }
    for (const c of incoming) circuitIds.add(c.id)
  }

  return { circuitIds: [...circuitIds], unresolved }
}
