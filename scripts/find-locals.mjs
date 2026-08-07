import { readFileSync } from 'fs'

const base = 'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const ssXml = readFileSync(base + '/sharedStrings.xml', 'utf8')
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
    /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g,
  )) {
    const col = cm[1]
    const row = +cm[2]
    const attrs = cm[3]
    const body = cm[4]
    const vm = body.match(/<v>([^<]*)<\/v>/)
    const fm = body.match(/<f[^>]*>([\s\S]*?)<\/f>/)
    let val = vm ? vm[1] : null
    if (val != null && /t="s"/.test(attrs)) val = strings[+val]
    else if (val != null && /^-?\d/.test(val)) val = Number(val)
    if (!rows.has(row)) rows.set(row, {})
    rows.get(row)[col] = { val, f: fm ? fm[1] : null, attrs }
  }
  return rows
}

const ids = [
  'SSB-2LGS1103',
  'SSB-2ELG2104',
  'SSB-2PWS1101',
  'SSB-2PWS1130',
  'TRF-2LGE1130',
  'SSB-4PWS1101',
  'FAC-VENT1001',
]

// 230 sheet K formulas
const s230 = parseSheet(base + '/worksheets/sheet3.xml')
console.log('--- 230 col K for rows 26-29 ---')
for (const r of [26, 27, 28, 29]) {
  const row = s230.get(r)
  console.log(r, {
    I: row?.I?.val,
    K: row?.K?.val,
    Kf: row?.K?.f,
    J: row?.J?.val,
    L: row?.L?.val,
  })
}

// Search all sheets for these PUMA ids and nearby local-looking values
const sheetFiles = [
  'sheet1',
  'sheet2',
  'sheet3',
  'sheet15',
  'sheet11',
  'sheet10',
]
for (const id of ids.slice(0, 4)) {
  const hits = []
  for (const sf of sheetFiles) {
    const rows = parseSheet(base + `/worksheets/${sf}.xml`)
    for (const [rn, row] of rows) {
      for (const [col, cell] of Object.entries(row)) {
        if (cell.val === id) {
          hits.push({
            sheet: sf,
            rn,
            col,
            nearby: Object.fromEntries(
              Object.entries(row)
                .filter(([c]) => 'EFGHIJKL'.includes(c))
                .map(([c, v]) => [c, v.val]),
            ),
          })
        }
      }
    }
  }
  console.log('hits', id, hits.slice(0, 6))
}

// Main Equipment Report = rId15 = sheet15?
// workbook: Main Equipment Report rId15 -> need check
const wbRels = readFileSync(base + '/_rels/workbook.xml.rels', 'utf8')
const m = [...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)]
console.log(
  'rId15',
  m.find((x) => x[1] === 'rId15')?.[2],
)
