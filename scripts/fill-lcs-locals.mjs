/**
 * Rellena equipment.local desde Main Equipment Report (col H),
 * misma lógica que el VLOOKUP de Destination Local (col K) en 440/230.
 */
import { readFileSync, writeFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'

const ssXml = readFileSync(`${base}/sharedStrings.xml`, 'utf8')
const strings = []
for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  strings.push(
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''),
  )
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
  return rows
}

function localFromReport(h) {
  if (h == null) return null
  if (typeof h === 'number' && Number.isNaN(h)) return null
  const s = String(h).trim()
  if (!s || s === 'NaN') return null
  // Misma regla Excel: primer token antes del espacio
  const sp = s.indexOf(' ')
  return sp > 0 ? s.slice(0, sp) : s
}

function isBadLocal(v) {
  if (v == null) return true
  const s = String(v).trim()
  return !s || s === 'NaN' || s === 'undefined' || s === '#N/A'
}

const report = parseSheet(`${base}/worksheets/sheet15.xml`)
/** @type {Map<string, string>} */
const localByPuma = new Map()
for (const [, row] of report) {
  const puma = row.B
  if (typeof puma !== 'string' || !/^[A-Z]{2,}-/.test(puma)) continue
  const loc = localFromReport(row.H)
  if (loc && !localByPuma.has(puma)) localByPuma.set(puma, loc)
}
console.log('Main Equipment Report locals:', localByPuma.size)
for (const id of [
  'SSB-2LGS1103',
  'SSB-2ELG2104',
  'SSB-2PWS1101',
  'SSB-2PWS1130',
  'TRF-2LGE1130',
  'SSB-4PWS1101',
]) {
  console.log(id, '→', localByPuma.get(id) ?? '(none)')
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
let filled = 0
let overwrittenBad = 0
for (const eq of data.equipment) {
  if (eq.virtual || eq.spare) continue
  const fromReport = localByPuma.get(eq.id)
  if (!fromReport) continue
  if (isBadLocal(eq.local)) {
    eq.local = fromReport
    filled++
    if (eq.local !== fromReport) overwrittenBad++
  }
}

// También equipos destino LCS que aún no estén en equipment (no debería)
writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')

const missing = []
for (const c of data.circuits) {
  if (
    c.originId !== 'LCS-4PWS0001' ||
    c.virtual ||
    /^QVM-|^QNV-/.test(c.protectionName)
  )
    continue
  const eq = data.equipment.find((e) => e.id === c.destinationId)
  if (!eq?.spare && !eq?.local) missing.push(eq?.id ?? c.destinationId)
}
console.log({ filled, stillMissingNonSpare: missing })
