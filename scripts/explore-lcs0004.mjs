/**
 * Explora filas Excel LCS-4PWS0004 / TRF-6PWS0004 / CSB.
 */
import { readFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
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

function dumpHits(label, rows) {
  const hits = []
  let fromTrf = 0
  let fromLcs = 0
  let qs = []
  for (const [rn, row] of rows) {
    const blob = Object.values(row).map(String).join('|')
    if (
      !/LCS-4PWS0004|TRF-6PWS0004|CENTRO DE CARGA N-4|TRANSFORMADOR N[º°]?4/i.test(
        blob,
      )
    )
      continue
    const o = row.E
    if (o === 'TRF-6PWS0004') fromTrf++
    if (o === 'LCS-4PWS0004') fromLcs++
    const ref = String(row.D ?? '')
    if (/QS\d/i.test(ref) || /QS\d/i.test(String(row.AD ?? ''))) {
      qs.push({
        rn,
        D: row.D,
        E: row.E,
        I: row.I,
        AD: row.AD,
        N: row.N,
        L: typeof row.L === 'string' ? row.L.slice(0, 40) : row.L,
      })
    }
    hits.push({
      rn,
      D: row.D,
      E: row.E,
      I: row.I,
      AD: row.AD,
      N: row.N,
      L: typeof row.L === 'string' ? row.L.slice(0, 40) : row.L,
      K: row.K,
    })
  }
  console.log(label, { total: hits.length, fromTrf, fromLcs, qs })
  console.log('sample', JSON.stringify(hits.slice(0, 25), null, 2))
  if (qs.length) console.log('QS hits', JSON.stringify(qs, null, 2))
}

dumpHits('440', parseSheet(`${base}/worksheets/sheet2.xml`))
dumpHits('230', parseSheet(`${base}/worksheets/sheet3.xml`))

const report = parseSheet(`${base}/worksheets/sheet15.xml`)
for (const [, row] of report) {
  if (
    row.B === 'LCS-4PWS0004' ||
    row.B === 'TRF-6PWS0004' ||
    String(row.B ?? '').startsWith('CSB-4PWS')
  ) {
    console.log('equip', {
      B: row.B,
      C: typeof row.C === 'string' ? row.C.slice(0, 60) : row.C,
      H: row.H,
    })
  }
}
