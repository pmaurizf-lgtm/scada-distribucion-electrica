/**
 * Explora filas Excel relacionadas con LCS-4PWS0002 / TRF-6PWS0002.
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
  for (const [rn, row] of rows) {
    const blob = Object.values(row).map(String).join('|')
    if (
      /LCS-4PWS0002|TRF-6PWS0002|CENTRO DE CARGA N-2|TRANSFORMADOR N[º°]?2/i.test(
        blob,
      )
    ) {
      hits.push({
        rn,
        D: row.D,
        E: row.E,
        I: row.I,
        AD: row.AD,
        N: row.N,
        Q: row.Q,
        L: typeof row.L === 'string' ? row.L.slice(0, 40) : row.L,
        O: row.O,
        AJ: row.AJ,
        AE: row.AE,
        AF: row.AF,
        K: row.K,
        W: row.W,
        X: row.X,
      })
    }
  }
  console.log(label, 'hits', hits.length)
  console.log(JSON.stringify(hits.slice(0, 60), null, 2))
}

dumpHits('440', parseSheet(`${base}/worksheets/sheet2.xml`))
dumpHits('230', parseSheet(`${base}/worksheets/sheet3.xml`))
