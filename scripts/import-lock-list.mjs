/**
 * Genera src/data/lockList.json desde el Excel LOTO de candados.
 *
 * Uso:
 *   node scripts/import-lock-list.mjs
 *   node scripts/import-lock-list.mjs "C:/ruta/Prueba 1 candados.xlsx"
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'src/data/lockList.json')

const DEFAULT_XLSX =
  'C:/Users/pmouriz/Documents/Archivos fuente APP Distribución/Prueba 1 candados.xlsx'

const xlsxPath = process.argv[2] || DEFAULT_XLSX
if (!fs.existsSync(xlsxPath)) {
  console.error('Excel no encontrado:', xlsxPath)
  process.exit(1)
}

const sys = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/system690.json'), 'utf8'),
)
const abt = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/abtDownstream.json'), 'utf8'),
)
const circuits = [...sys.circuits, ...abt.circuits].filter((c) => !c.virtual)

function cellStr(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s || null
}

function normalizeInterruptorRef(raw) {
  const base = raw.trim()
  const out = new Set([base])
  const noPole = base.replace(/-[A-D]$/i, '')
  if (noPole !== base) out.add(noPole)
  const beforeUs = base.split('_')[0].trim()
  if (beforeUs && beforeUs !== base) {
    out.add(beforeUs)
    out.add(beforeUs.replace(/-[A-D]$/i, ''))
  }
  return [...out]
}

function normalizeProtLabel(raw) {
  if (!raw) return null
  const s = raw.split('_')[0].trim()
  return s || null
}

function findCircuitByRefOrProt(candidates) {
  for (const q of candidates) {
    const ql = q.toLowerCase()
    const hit = circuits.find(
      (c) =>
        c.id.toLowerCase() === ql ||
        (c.circuitRef && c.circuitRef.toLowerCase() === ql) ||
        c.protectionName.toLowerCase() === ql,
    )
    if (hit) return hit
  }
  return undefined
}

const wb = XLSX.readFile(xlsxPath)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: null,
  raw: false,
})

const locks = {}
const unresolved = []
let rowsN = 0

for (let r = 1; r < rows.length; r++) {
  const row = rows[r]
  if (!row) continue
  const interruptor = cellStr(row[3])
  const lockNumber = cellStr(row[11])
  if (!interruptor || !lockNumber) continue
  rowsN++
  const shortName = cellStr(row[4]) || undefined
  const siteEquipment = cellStr(row[5]) || undefined
  const local = cellStr(row[6]) || undefined
  const comment = cellStr(row[13]) || undefined

  const candidates = normalizeInterruptorRef(interruptor)
  let circuit = findCircuitByRefOrProt(candidates)

  if (!circuit && /^CCM-/i.test(interruptor)) {
    const ccmId = siteEquipment || interruptor.replace(/-\d+$/i, '')
    const prot = normalizeProtLabel(comment)
    if (ccmId && prot) {
      circuit = circuits.find(
        (c) =>
          c.originId.toUpperCase() === ccmId.toUpperCase() &&
          c.protectionName.toLowerCase() === prot.toLowerCase(),
      )
    }
  }

  if (!circuit && comment) {
    circuit = findCircuitByRefOrProt(
      normalizeInterruptorRef(comment.replace(/_CANDADO.*$/i, '')),
    )
  }

  if (!circuit) {
    unresolved.push(interruptor)
    continue
  }

  locks[circuit.id] = {
    lockNumber,
    interruptor,
    shortName,
    siteEquipment,
    local,
    comment,
  }
}

const payload = {
  source: path.basename(xlsxPath),
  generatedAt: new Date().toISOString(),
  count: Object.keys(locks).length,
  locks,
  unresolved,
}

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8')
console.log('Rows with D+L:', rowsN)
console.log('Resolved:', payload.count)
console.log('Unresolved:', unresolved.length, unresolved.slice(0, 20))
console.log('Wrote', OUT)
