/**
 * Enriquece system690.json con datos de cable desde la hoja «690V Power System»
 * del Excel lista de circuitos (cols W–AC, X, Y).
 */
import { readFileSync, writeFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/scada-distribucion-electrica/.tmp/xlsm_unpack/unpacked/xl'
const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/system690.json'

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
  return rows
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

const wb = readFileSync(`${base}/workbook.xml`, 'utf8')
const sheets = [
  ...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g),
].map((m) => ({ name: m[1], rid: m[2] }))
const rels = readFileSync(`${base}/_rels/workbook.xml.rels`, 'utf8')
const ridToTarget = Object.fromEntries(
  [...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [
    m[1],
    m[2].replace(/^\//, ''),
  ]),
)

const sheet690 = sheets.find((s) => /690V Power System/i.test(s.name))
if (!sheet690) {
  console.error('No 690V sheet')
  process.exit(1)
}
const sheetPath = `${base}/${ridToTarget[sheet690.rid]}`.replace(/\\/g, '/')
const rows = parseSheet(sheetPath)

let headerRn = null
for (const [rn, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
  if (rn > 25) break
  const vals = Object.values(row).map(String)
  if (
    vals.some((v) => /PUMA/i.test(v)) &&
    vals.some((v) => /Cable Type|Section|Paralell/i.test(v))
  ) {
    headerRn = rn
    break
  }
}
if (headerRn == null) {
  console.error('No header')
  process.exit(1)
}

/** Columnas fijas del Excel lista de circuitos (Rev.D). */
const COL = {
  parallel: 'X',
  section: 'Y',
  cableType: 'W',
  lest: 'Z',
  lforc: 'AA',
  lroute: 'AB',
  lreal: 'AC',
  weight: 'BF',
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
const byRef = new Map()
const byRow = new Map()
for (const [rn, row] of rows) {
  if (rn <= headerRn) continue
  const ref = str(row.D)
  if (!ref) continue
  byRef.set(ref, row)
  byRow.set(rn, row)
}

let updated = 0
const samples = []

for (const c of data.circuits) {
  if (c.virtual) continue
  const row =
    (c.excelRow != null ? byRow.get(c.excelRow) : null) ||
    (c.circuitRef ? byRef.get(c.circuitRef) : null)
  if (!row) continue

  const parallel = num(row[COL.parallel])
  const cableSectionRaw = str(row[COL.section])
  const sectionOk =
    !!cableSectionRaw &&
    !/^P2/i.test(cableSectionRaw) &&
    (/^\d/.test(cableSectionRaw) ||
      cableSectionRaw.includes('×') ||
      cableSectionRaw.includes('x'))
  const cableType = str(row[COL.cableType])
  const lreal = num(row[COL.lreal])
  const lroute = num(row[COL.lroute])
  const lforc = num(row[COL.lforc])
  const lest = num(row[COL.lest])
  const lengthM = lreal ?? lroute ?? lforc ?? lest
  const weightKg = num(row[COL.weight])

  let changed = false
  if (parallel != null && c.parallelCables !== parallel) {
    c.parallelCables = parallel
    changed = true
  }
  if (sectionOk && c.cableSection !== cableSectionRaw) {
    c.cableSection = cableSectionRaw
    changed = true
  }
  if (cableType && c.cableType !== cableType) {
    c.cableType = cableType
    changed = true
  }
  if (lengthM != null && c.cableLengthM !== lengthM) {
    c.cableLengthM = lengthM
    changed = true
  }
  if (weightKg != null && c.cableWeightKg !== weightKg) {
    c.cableWeightKg = weightKg
    changed = true
  }

  if (changed) {
    updated++
    if (samples.length < 6) {
      samples.push({
        id: c.id,
        ref: c.circuitRef,
        parallel: c.parallelCables,
        section: c.cableSection,
        type: c.cableType,
        lengthM: c.cableLengthM,
      })
    }
  }
}

data.notes = data.notes || {}
data.notes.mapping = {
  ...data.notes.mapping,
  cableType: 'W',
  parallelCables: 'X',
  cableSection: 'Y',
  cableLengthEstM: 'Z',
  cableLengthForcM: 'AA',
  cableLengthRouteM: 'AB',
  cableLengthRealM: 'AC',
  cableWeightKg: 'BF',
}

writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
console.log({ updated, samples })
