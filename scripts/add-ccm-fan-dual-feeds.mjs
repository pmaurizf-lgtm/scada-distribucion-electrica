/**
 * Añade segundas alimentaciones FAN-VEM (*Q2, marcha rápida/lenta)
 * desde «Listado CCM completo F110.xlsx» hoja CCMs.
 *
 * Uso:
 *   node scripts/add-ccm-fan-dual-feeds.mjs "C:\\Users\\pmouriz\\Downloads\\Listado CCM completo F110.xlsx"
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

function round6(n) {
  if (n == null) return null
  return Math.round(n * 1e10) / 1e10
}

function serviceOf(v) {
  const s = str(v)
  if (s === 'VS' || s === 'VM' || s === 'NV') return s
  return 'VS'
}

function lineTypeOf(v) {
  const m = str(v)
  if (m === 'Alternative' || m === 'Alternativa') return 'alternativa'
  return 'normal'
}

const buf = readFileSync(xlsxPath)
const wb = XLSX.read(buf, { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets['CCMs'], {
  header: 1,
  defval: null,
  raw: true,
})

let headerIdx = -1
for (let i = 0; i < rows.length; i++) {
  if (str(rows[i]?.[3]) === 'Circuit' && /Breaker ID/i.test(str(rows[i]?.[29]))) {
    headerIdx = i
    break
  }
}
if (headerIdx < 0) {
  console.error('Cabecera Circuit / Breaker ID no encontrada')
  process.exit(1)
}

const file = JSON.parse(readFileSync(jsonPath, 'utf8'))
const existingRefs = new Set(
  file.circuits.filter((c) => c.circuitRef).map((c) => c.circuitRef),
)
const existingPair = new Set(
  file.circuits
    .filter((c) => !c.virtual)
    .map((c) => `${c.originId}>${c.destinationId}>${c.protectionName}`),
)
const eqIds = new Set(file.equipment.map((e) => e.id))

let maxSeq = 0
for (const c of file.circuits) {
  const m = String(c.id).match(/^690-(\d+)$/)
  if (m) maxSeq = Math.max(maxSeq, Number(m[1]))
}

const added = []
for (let i = headerIdx + 1; i < rows.length; i++) {
  const row = rows[i]
  if (!row) continue
  const circuitRef = str(row[3])
  const originId = str(row[4])
  const destPuma = str(row[8])
  const destDcp = str(row[9])
  const destDesc = str(row[11])
  const breakerId = str(row[29])
  if (!circuitRef || !/^CCM-/i.test(originId)) continue
  if (circuitRef === 'Circuit') continue
  if (!/^FAN-VEMS/i.test(destPuma)) continue
  if (!/Q2$/i.test(breakerId)) continue
  if (existingRefs.has(circuitRef)) continue
  if (existingPair.has(`${originId}>${destPuma}>${breakerId}`)) continue
  if (!eqIds.has(destPuma)) {
    console.warn(`Equipo destino ausente, se omite: ${destPuma}`)
    continue
  }

  maxSeq += 1
  const id = `690-${String(maxSeq).padStart(4, '0')}`
  const circuit = {
    id,
    excelRow: i + 1,
    circuitRef,
    name: `${originId} → ${destPuma}`,
    originId,
    destinationId: destPuma,
    lineType: lineTypeOf(row[12]),
    service: serviceOf(row[13]),
    protectionName: breakerId,
    protectionModel: str(row[30]) || undefined,
    protectionCurrentA: num(row[31]),
    pKWe: round6(num(row[35]) ?? num(row[14])),
    qKVAr: round6(num(row[36])),
    sKVA: round6(num(row[37])),
    ibA: round6(num(row[38])),
    voltage: 690,
    pnKW: round6(num(row[14])),
    parallelCables: num(row[23]) || 1,
    cableSection: str(row[24]) || undefined,
    virtual: false,
    notes: 'fan-dual-speed',
  }
  // limpiar undefined
  for (const k of Object.keys(circuit)) {
    if (circuit[k] === undefined) delete circuit[k]
  }

  file.circuits.push(circuit)
  existingRefs.add(circuitRef)
  existingPair.add(`${originId}>${destPuma}>${breakerId}`)
  added.push(circuit)

  // Asegurar dcp10Id en equipo si falta
  const eq = file.equipment.find((e) => e.id === destPuma)
  if (eq && destDcp && !eq.dcp10Id) eq.dcp10Id = destDcp
  if (eq && destDesc && (!eq.name || eq.name === eq.id)) eq.name = destDesc
}

writeFileSync(jsonPath, JSON.stringify(file, null, 2) + '\n', 'utf8')

console.log(`Añadidos ${added.length} circuitos FAN *Q2:`)
for (const c of added) {
  console.log(
    `  ${c.circuitRef}  ${c.originId} → ${c.destinationId}  ${c.protectionName}  (${c.id})`,
  )
}
