import { readFileSync } from 'fs'
const base = 'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const ssXml = readFileSync(base + '/sharedStrings.xml', 'utf8')
const strings = []
for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  strings.push(
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''),
  )
}
function rowCells(xml, row) {
  const cells = {}
  const re = new RegExp(
    `<c r="([A-Z]+)${row}"([^>]*)>(?:[\\s\\S]*?<v>([^<]*)</v>)?`,
    'g',
  )
  for (const cm of xml.matchAll(re)) {
    let val = cm[3]
    if (val == null) {
      cells[cm[1]] = null
      continue
    }
    if (/t="s"/.test(cm[2])) val = strings[+val]
    else if (/^-?\d/.test(val)) val = Number(val)
    cells[cm[1]] = val
  }
  return cells
}
const xml2 = readFileSync(base + '/worksheets/sheet2.xml', 'utf8')
for (const row of [31, 32, 33]) {
  const c = rowCells(xml2, row)
  console.log('440', row, {
    D: c.D,
    E: c.E,
    I: c.I,
    K: c.K,
    L: c.L,
    O: c.O,
    AJ: c.AJ,
    AK: c.AK,
    AL: c.AL,
    AM: c.AM,
  })
}
const xml3 = readFileSync(base + '/worksheets/sheet3.xml', 'utf8')
for (const row of [26, 27, 33]) {
  const c = rowCells(xml3, row)
  console.log('230', row, {
    D: c.D,
    I: c.I,
    J: c.J,
    K: c.K,
    L: c.L,
    O: c.O,
    AJ: c.AJ,
  })
}
