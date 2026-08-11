/**
 * Genera src/data/nme674Map.json desde «Relación de SSB completa con NME.xlsx».
 * Cruza col. D (DCP10 / PUMA) ↔ col. E (NME-674) en todas las pestañas SSB.
 */
import { readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SRC_DIR = 'C:/Users/pmouriz/Documents/Archivos fuente APP Distribución'
const OUT =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/nme674Map.json'

function cellStr(v) {
  if (v == null) return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const s = String(v).trim()
  return s || null
}

const file = readdirSync(SRC_DIR).find((n) => /NME|SSB completa/i.test(n))
if (!file) throw new Error('No se encontró el Excel de SSB/NME')
const wb = XLSX.readFile(join(SRC_DIR, file))

/** @type {Record<string, string>} */
const map = {}
let rows = 0
for (const sn of wb.SheetNames) {
  if (/^TOTAL$/i.test(sn)) continue
  const sheet = wb.Sheets[sn]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  for (let i = 1; i < data.length; i++) {
    const row = data[i] || []
    const dcp = cellStr(row[3]) // D
    const elemento = cellStr(row[2]) // C (fallback)
    const nme = cellStr(row[4]) // E
    if (!nme) continue
    const key = dcp || elemento
    if (!key || !/^SSB-/i.test(key)) continue
    if (!map[key]) {
      map[key] = nme
      rows++
    }
  }
}

const sorted = Object.fromEntries(
  Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], 'es')),
)
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
console.log({ file, mapped: rows, out: OUT })
