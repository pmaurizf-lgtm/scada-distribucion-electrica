/**
 * Enriquece abtDownstream.json con Local, DCP-10, P/Q/S/Ib/Pn
 * desde las pestañas 440V / 230V Power System (misma fuente que el MSB).
 */
import { readFileSync, writeFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'

const ssXml = readFileSync(`${base}/sharedStrings.xml`, 'utf8')
const strings = []
for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const parts = [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1])
  strings.push(parts.join(''))
}

function parseSheet(path) {
  const xml = readFileSync(path, 'utf8')
  const rows = new Map()
  for (const cm of xml.matchAll(
    /<c r="([A-Z]+)(\d+)"([^>]*)>(?:[\s\S]*?<v>([^<]*)<\/v>)?/g,
  )) {
    const col = cm[1]
    const row = +cm[2]
    const attrs = cm[3]
    const v = cm[4]
    if (v == null) continue
    let val = v
    if (/t="s"/.test(attrs)) val = strings[+v] ?? v
    else if (/^-?\d/.test(v)) val = Number(v)
    if (!rows.has(row)) rows.set(row, {})
    rows.get(row)[col] = val
  }
  return rows;
}

function findHeader(rows) {
  for (const [rn, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (rn > 20) break
    const vals = Object.values(row).map(String)
    if (
      vals.some((v) => /PUMA/i.test(v)) &&
      vals.some((v) => /Local|Protec|kWe|Pn|In/i.test(v))
    ) {
      return { rn, row }
    }
  }
  return null
}

function mapCols(headerRow) {
  /** @type {Record<string, string>} */
  const byName = {}
  for (const [col, val] of Object.entries(headerRow)) {
    byName[String(val).trim().toLowerCase()] = col
  }
  const find = (...preds) => {
    for (const [name, col] of Object.entries(byName)) {
      if (preds.some((p) => p.test(name))) return col
    }
    return null
  }
  return {
    // Fixed letters from types.ts / MSB import if headers ambiguous
    originPuma: find(/origen.*puma|puma.*origen/) ?? 'E',
    destPuma: find(/destino.*puma|puma.*destino|dest\.?\s*puma/) ?? 'I',
    destLocal: find(/destino.*local|local.*destino/) ?? 'K',
    destDesc: find(/destino.*desc|descripci[oó]n.*destino|dest\.?\s*desc/) ?? 'L',
    destDcp: find(/destino.*dcp|dcp.*destino/) ?? 'J',
    service: find(/^servicio$|vitalidad|vm\/vs/) ?? 'N',
    pn: find(/^pn\b|pn\s*\[/) ?? 'O',
    protName: find(/protecci[oó]n.*nombre|nombre.*protec|^q\b/) ?? null,
    protModel: find(/modelo/) ?? 'AE',
    protIn: find(/\bin\b|intensidad nominal/) ?? 'AF',
    pKWe: find(/\bp\s*\[?kwe|^\s*p\s*$|kwe/) ?? 'AJ',
    qKVAr: find(/\bq\s*\[?kvar|kvar/) ?? 'AK',
    sKVA: find(/\bs\s*\[?kva|^\s*s\s*$/) ?? 'AL',
    ibA: find(/\bib\b/) ?? 'AM',
    cable: find(/secci[oó]n|cable/) ?? null,
    parallel: find(/paralel|n[ºo]?\s*cable/) ?? null,
    byName,
  }
}

function str(v) {
  if (v == null) return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const s = String(v).trim()
  if (!s || s === 'NaN' || s === '#N/A' || s === '#¡VALOR!' || s === '#VALUE!')
    return null
  return s
}

function num(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function enrichFromSheet(rows, voltage, data) {
  const hdr = findHeader(rows)
  if (!hdr) {
    console.error('No header for', voltage)
    return { updatedCircuits: 0, updatedEquip: 0 }
  }
  const cols = mapCols(hdr.row)
  console.log(voltage, 'header row', hdr.rn)
  console.log(
    voltage,
    'col map',
    Object.fromEntries(
      Object.entries(cols).filter(([k]) => k !== 'byName'),
    ),
  )
  // dump a few header names for debug
  console.log(
    'header names',
    Object.entries(hdr.row)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([c, v]) => `${c}=${String(v).slice(0, 32)}`)
      .slice(0, 50)
      .join(' | '),
  )

  let updatedCircuits = 0
  let updatedEquip = 0

  for (const [rn, row] of rows) {
    if (rn <= hdr.rn) continue
    const destId = str(row[cols.destPuma])
    const originId = str(row[cols.originPuma])
    if (!destId || !originId) continue
    if (!originId.startsWith('LCS-') && !destId.startsWith('LCS-')) {
      // also TRF→LCS rows
    }
    // Match circuits by origin+destination or by excelRow
    const matches = data.circuits.filter(
      (c) =>
        (c.excelRow === rn && String(c.voltage).replace(/\s*V$/i, '') === voltage) ||
        (c.originId === originId &&
          c.destinationId === destId &&
          String(c.voltage).replace(/\s*V$/i, '') === voltage),
    )
    if (matches.length === 0) continue

    const patch = {
      pKWe: num(row[cols.pKWe]),
      qKVAr: num(row[cols.qKVAr]),
      sKVA: num(row[cols.sKVA]),
      ibA: num(row[cols.ibA]),
      pnKW: num(row[cols.pn]),
    }
    // RESPETO / destinos no PUMA: no confiar en potencias basura del Excel
    const destOk = typeof destId === 'string' && /^[A-Z]{2,}-/.test(destId)
    if (!destOk || matches.some((c) => c.spare)) {
      if (patch.pKWe != null && patch.pKWe > 5000) patch.pKWe = null
      if (patch.qKVAr != null && Math.abs(patch.qKVAr) > 5000) patch.qKVAr = null
      if (patch.sKVA != null && patch.sKVA > 5000) patch.sKVA = null
    }
    if (cols.protModel && row[cols.protModel] != null) {
      patch.protectionModel = str(row[cols.protModel])
    }
    if (cols.protIn && row[cols.protIn] != null) {
      patch.protectionCurrentA = num(row[cols.protIn])
    }

    for (const c of matches) {
      let changed = false
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) continue
        if (c[k] !== v) {
          c[k] = v
          changed = true
        }
      }
      if (changed) updatedCircuits++
    }

    // Equipment destination fields
    const eq = data.equipment.find((e) => e.id === destId)
    if (eq && !eq.virtual) {
      const local = str(row[cols.destLocal])
      const dcp = str(row[cols.destDcp])
      const name = str(row[cols.destDesc])
      let eChanged = false
      if (local && !eq.local) {
        eq.local = local
        eChanged = true
      }
      if (dcp && dcp !== destId && !eq.dcp10Id) {
        eq.dcp10Id = dcp
        eChanged = true
      }
      // Prefer descriptive name from Excel col L when current name is just the id
      if (name && (eq.name === eq.id || !eq.name)) {
        eq.name = name
        eChanged = true
      }
      if (eChanged) updatedEquip++
    }
  }
  return { updatedCircuits, updatedEquip }
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
const r440 = enrichFromSheet(
  parseSheet(`${base}/worksheets/sheet2.xml`),
  '440',
  data,
)
const r230 = enrichFromSheet(
  parseSheet(`${base}/worksheets/sheet3.xml`),
  '230',
  data,
)
console.log('440', r440, '230', r230)

writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
console.log('wrote', jsonPath)
