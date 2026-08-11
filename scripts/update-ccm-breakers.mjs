/**
 * Actualiza interruptores de salidas CCM desde «Listado CCM completo F110.xlsx»
 * (hoja CCMs): Breaker ID (AD), tipo (AE), In (AF).
 *
 * Uso:
 *   node scripts/update-ccm-breakers.mjs "C:\\Users\\pmouriz\\Downloads\\Listado CCM completo F110.xlsx"
 */
import XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const jsonPath = join(root, 'src', 'data', 'system690.json')
const xlsxPath = process.argv[2]

if (!xlsxPath) {
  console.error('Falta ruta al Excel')
  process.exit(1)
}

function str(v) {
  if (v == null) return ''
  return String(v).trim()
}

function num(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const buf = readFileSync(xlsxPath)
const wb = XLSX.read(buf, { type: 'buffer' })
const sheetName = wb.SheetNames.find((n) => /^ccms$/i.test(n)) || wb.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
  header: 1,
  defval: null,
  raw: true,
})

let headerIdx = -1
for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  if (!row) continue
  if (str(row[3]) === 'Circuit' && /Breaker ID/i.test(str(row[29]))) {
    headerIdx = i
    break
  }
}
if (headerIdx < 0) {
  console.error('No se encontró la fila de cabecera Circuit / Breaker ID')
  process.exit(1)
}

/** @type {Map<string, { circuitRef: string, originId: string, destPuma: string, destDcp: string, breakerId: string, breakerType: string, inA: number|null, excelRow: number }>} */
const byRef = new Map()
/** @type {Map<string, typeof byRef extends Map<string, infer V> ? V : never>} */
const byPair = new Map()

let excelRows = 0
for (let i = headerIdx + 1; i < rows.length; i++) {
  const row = rows[i]
  if (!row) continue
  const circuitRef = str(row[3])
  const originId = str(row[4])
  const destPuma = str(row[8])
  const destDcp = str(row[9])
  const breakerId = str(row[29])
  const breakerType = str(row[30])
  const inA = num(row[31])
  if (!circuitRef || !originId) continue
  if (!/^CCM-/i.test(originId)) continue
  if (!breakerId || breakerId === '-' || breakerId === '0') continue
  // Filas de cabecera de otro CCM intercaladas
  if (circuitRef === 'Circuit') continue
  excelRows++
  const rec = {
    circuitRef,
    originId,
    destPuma,
    destDcp,
    breakerId,
    breakerType,
    inA,
    excelRow: i + 1,
  }
  byRef.set(circuitRef, rec)
  if (destPuma) byPair.set(`${originId}>${destPuma}`, rec)
  // SPARE / RESPETO: destino puede ser vacío o etiqueta
}

const file = JSON.parse(readFileSync(jsonPath, 'utf8'))
const ccmCircuits = file.circuits.filter(
  (c) => !c.virtual && /^CCM-/i.test(c.originId || ''),
)

let updated = 0
let unmatched = []
const changes = []

for (const c of ccmCircuits) {
  const rec =
    (c.circuitRef && byRef.get(c.circuitRef)) ||
    byPair.get(`${c.originId}>${c.destinationId}`)
  if (!rec) {
    unmatched.push(`${c.id} ${c.circuitRef || ''} ${c.originId}→${c.destinationId} (${c.protectionName})`)
    continue
  }
  const before = {
    protectionName: c.protectionName,
    protectionModel: c.protectionModel,
    protectionCurrentA: c.protectionCurrentA,
  }
  let changed = false
  if (c.protectionName !== rec.breakerId) {
    c.protectionName = rec.breakerId
    changed = true
  }
  if (rec.breakerType && c.protectionModel !== rec.breakerType) {
    c.protectionModel = rec.breakerType
    changed = true
  }
  if (rec.inA != null && c.protectionCurrentA !== rec.inA) {
    c.protectionCurrentA = rec.inA
    changed = true
  }
  if (changed) {
    updated++
    changes.push({
      id: c.id,
      ref: c.circuitRef,
      dest: c.destinationId,
      dcp: rec.destDcp || null,
      before,
      after: {
        protectionName: c.protectionName,
        protectionModel: c.protectionModel,
        protectionCurrentA: c.protectionCurrentA,
      },
    })
  }
}

writeFileSync(jsonPath, JSON.stringify(file, null, 2) + '\n', 'utf8')

console.log(`Hoja: ${sheetName}`)
console.log(`Filas Excel CCM con Breaker ID: ${excelRows}`)
console.log(`Circuitos CCM en JSON: ${ccmCircuits.length}`)
console.log(`Actualizados: ${updated}`)
console.log(`Sin match: ${unmatched.length}`)
if (unmatched.length) {
  console.log('--- unmatched (máx 40) ---')
  for (const u of unmatched.slice(0, 40)) console.log(u)
}
console.log('--- ejemplos ---')
for (const ch of changes.slice(0, 12)) {
  console.log(
    `${ch.ref} → ${ch.dest}${ch.dcp ? ` (DCP ${ch.dcp})` : ''}: ${ch.before.protectionName} → ${ch.after.protectionName} | ${ch.after.protectionModel} | In=${ch.after.protectionCurrentA}`,
  )
}
