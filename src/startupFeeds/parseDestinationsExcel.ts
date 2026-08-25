import * as XLSX from 'xlsx'

const HEADER_RE =
  /^(destino|equipo|id|puma|dcp|nombre|destinos|equipment)$/i
const SKIP_RE = /^(-|—|n\/?a|na|none|null)?$/i

/** ¿Parece un ID de equipo (PUMA / código con guión)? */
export function looksLikeEquipmentId(raw: string): boolean {
  const s = raw.trim()
  if (!s || SKIP_RE.test(s) || HEADER_RE.test(s)) return false
  // Códigos típicos: CCM-6PWS0004, UPS-PROP0001, MSB-6PWS0001
  if (/^[A-Z0-9]{2,}[-_/][A-Z0-9._-]{2,}$/i.test(s)) return true
  // Sin guión pero alfanumérico largo
  if (/^[A-Z]{2,}[A-Z0-9]{4,}$/i.test(s) && s.length >= 6) return true
  return false
}

/**
 * Extrae IDs de destino de un libro Excel (1ª hoja).
 * Recorre todas las celdas; deduplica conservando orden.
 */
export function parseDestinationsFromWorkbook(data: ArrayBuffer): string[] {
  const wb = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | null)[][]

  const seen = new Set<string>()
  const out: string[] = []

  for (const row of rows) {
    if (!row) continue
    for (const cell of row) {
      if (cell == null) continue
      const text = String(cell).trim()
      if (!looksLikeEquipmentId(text)) continue
      const key = text.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(text)
    }
  }
  return out
}

/** Parsea texto manual: una línea o token separados por coma/punto y coma. */
export function parseDestinationsFromText(text: string): string[] {
  const parts = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (!looksLikeEquipmentId(p) && !/^[A-Z0-9._-]{4,}$/i.test(p)) continue
    const key = p.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}
