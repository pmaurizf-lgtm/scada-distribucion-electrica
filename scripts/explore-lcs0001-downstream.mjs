/**
 * Explora filas 440V Power System con origen en salidas de LCS-4PWS0001
 * o en equipos aguas abajo de esas salidas.
 */
import { readFileSync, writeFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'

const j = JSON.parse(readFileSync(jsonPath, 'utf8'))
const lcsOutlets = j.circuits
  .filter(
    (c) =>
      c.originId === 'LCS-4PWS0001' &&
      !c.virtual &&
      String(c.voltage).startsWith('440') &&
      !c.destinationId.startsWith('BUS-'),
  )
  .map((c) => c.destinationId)

const seed = new Set(lcsOutlets.filter((id) => !id.startsWith('SPARE-')))

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
    if (/t="s"/.test(attrs)) val = strings[+val] ?? val
    else if (/^-?\d/.test(val)) val = Number(val)
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

const rows = parseSheet(`${base}/worksheets/sheet2.xml`)
const byOrigin = new Map()
for (const [rn, row] of rows) {
  const origin = str(row.E)
  if (!origin) continue
  if (!byOrigin.has(origin)) byOrigin.set(origin, [])
  byOrigin.get(origin).push({ rn, row })
}

console.log('Seed outlets from LCS-0001 440:', [...seed].sort().join(', '))

// BFS: collect all rows whose origin is reachable from seed
const known = new Set(seed)
const queue = [...seed]
const foundRows = []
while (queue.length) {
  const id = queue.shift()
  const list = byOrigin.get(id) ?? []
  for (const { rn, row } of list) {
    const dest = str(row.I)
    const ref = str(row.D)
    const desc = str(row.L)
    foundRows.push({
      rn,
      origin: id,
      dest,
      ref,
      desc,
      prot: str(row.AD),
      service: str(row.C),
      local: str(row.K),
    })
    if (dest && /^[A-Z]{2,}-/.test(dest) && !known.has(dest)) {
      known.add(dest)
      queue.push(dest)
    }
  }
}

console.log('Downstream excel rows:', foundRows.length)
console.log('Unique origins with children:', new Set(foundRows.map((r) => r.origin)).size)

const byOrigCount = {}
for (const r of foundRows) {
  byOrigCount[r.origin] = (byOrigCount[r.origin] ?? 0) + 1
}
console.log(JSON.stringify(byOrigCount, null, 2))

writeFileSync(
  'C:/Users/pmouriz/scada-distribucion-electrica/scripts/_lcs0001-downstream-440.json',
  JSON.stringify(foundRows, null, 2),
)
console.log('Wrote scripts/_lcs0001-downstream-440.json')
