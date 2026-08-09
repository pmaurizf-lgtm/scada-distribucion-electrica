/**
 * Importa «400Hz Power System» (Excel sheet5) → abtDownstream.json
 *
 * Prefijo abt-400, notes=hz400, voltage según col. Q (440/115/200…).
 * Uso: node scripts/import-400hz-power.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const jsonPath = join(root, 'src/data/abtDownstream.json')
const baseCandidates = [
  join(root, '.tmp/xlsm_unpacked/xl'),
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl',
]
const base = baseCandidates.find((p) => existsSync(join(p, 'sharedStrings.xml')))
if (!base) {
  console.error('No se encontró Excel descomprimido. Unpack a .tmp/xlsm_unpacked/')
  process.exit(1)
}

const ID_PREFIX = 'abt-400'
const NOTE = 'hz400'

const ssXml = readFileSync(join(base, 'sharedStrings.xml'), 'utf8')
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

function num(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function round6(v) {
  if (v == null) return null
  return Math.round(v * 1e6) / 1e6
}

function isPuma(v) {
  return typeof v === 'string' && /^[A-Z]{2,}-/.test(v)
}

function isRespeto(dest, desc) {
  if (!isPuma(dest)) return true
  const d = (desc ?? '').toUpperCase().trim()
  return (
    d === 'RESPETO' ||
    d.startsWith('RESPETO ') ||
    d === 'SPARE' ||
    d.startsWith('SPARE ')
  )
}

function kindOf(destId, desc) {
  if (destId.startsWith('BUS-')) return 'cuadro_secundario'
  if (isRespeto(destId, desc)) return 'consumidor'
  if (/^(MSB|SSB|SCV|SBT|FIU|TRF|CTP|LCS|CCM)-/i.test(destId)) {
    if (/^TRF-/i.test(destId)) return 'conversion'
    if (/^SCV-/i.test(destId)) return 'conversion'
    if (/^MSB-/i.test(destId)) return 'cuadro_principal'
    return 'cuadro_secundario'
  }
  const d = (desc ?? '').toUpperCase()
  if (d.includes('TRANSFORMADOR')) return 'conversion'
  if (d.includes('CONVERTIDOR')) return 'conversion'
  if (d.includes('CUADRO') || d.includes('PANEL')) return 'cuadro_secundario'
  return 'consumidor'
}

function serviceOf(v) {
  const s = str(v)
  if (s === 'VS' || s === 'VM' || s === 'NV') return s
  return 'VM'
}

function lineTypeOf(row) {
  const m = str(row.M)
  if (m === 'Alternative' || m === 'Alternativa') return 'alternativa'
  return 'normal'
}

function protectionFromRef(circuitRef, breakerId) {
  const brk = str(breakerId)
  if (brk && brk !== '0' && brk !== '-') return brk
  const ref = String(circuitRef || '').trim()
  const m = ref.match(/(Q\d+(?:-\d+)*)$/i)
  if (m) return m[1]
  return ref.split('-').pop() || '—'
}

function voltageLabel(v, freq) {
  const n = num(v)
  const f = num(freq)
  if (n == null) return f === 400 ? '400Hz' : '440'
  if (f === 400) return String(n)
  return String(n)
}

const rows = parseSheet(join(base, 'worksheets/sheet5.xml'))
const file = JSON.parse(readFileSync(jsonPath, 'utf8'))
const eqById = new Map(file.equipment.map((e) => [e.id, e]))
const existingIds = new Set(file.circuits.map((c) => c.id))
const existingPair = new Set(
  file.circuits
    .filter((c) => !c.virtual)
    .map((c) => `${c.originId}>${c.destinationId}>${c.protectionName}`),
)

const addedEquipment = []
const addedCircuits = []
let skippedDup = 0
let seq = file.circuits.filter((c) => String(c.id).startsWith(ID_PREFIX)).length

function ensureEq(id, desc, voltage) {
  if (!isPuma(id)) return
  let e = eqById.get(id)
  if (!e) {
    e = {
      id,
      name: desc || id,
      kind: kindOf(id, desc),
      voltage: voltage || '400Hz',
      local: null,
      spare: isRespeto(id, desc),
      virtual: false,
    }
    eqById.set(id, e)
    addedEquipment.push(e)
  } else {
    if (/400/i.test(desc || '') || /^MSB-4SFS|^SCV-4SFS|^SSB-[12]SFS|^FIU-4SFS|^TRF-[124]SFS/i.test(id)) {
      e.voltage = voltage || e.voltage || '400Hz'
    }
    if (desc && (!e.name || e.name === e.id)) e.name = desc
    if (/^MSB-4SFS/i.test(id)) e.kind = 'cuadro_principal'
    if (/^SCV-4SFS|^TRF-/i.test(id)) e.kind = 'conversion'
  }
}

for (const [rn, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
  const circuitRef = str(row.D)
  const originId = str(row.E)
  const destId = str(row.I)
  if (!circuitRef || !isPuma(originId) || !isPuma(destId)) continue
  if (circuitRef === 'Circuit') continue

  const destDesc = str(row.L) || str(row.H)
  const originDesc = str(row.H)
  const vNom = voltageLabel(row.Q, row.R)
  const freq = num(row.R)

  ensureEq(originId, originDesc, freq === 400 ? vNom : vNom)
  ensureEq(destId, destDesc, vNom)

  const protectionName = protectionFromRef(circuitRef, row.AD)
  const pairKey = `${originId}>${destId}>${protectionName}`
  if (existingPair.has(pairKey)) {
    skippedDup++
    continue
  }

  seq += 1
  const id = `${ID_PREFIX}-${seq}`
  if (existingIds.has(id)) continue

  const circuit = {
    id,
    excelRow: rn,
    circuitRef,
    name: `${originId} → ${destId}`,
    originId,
    destinationId: destId,
    lineType: lineTypeOf(row),
    service: serviceOf(row.N),
    protectionName,
    protectionModel: str(row.AE),
    protectionCurrentA: num(row.AF),
    pnKW: round6(num(row.O)),
    pKWe: round6(num(row.AJ) ?? num(row.O)),
    qKVAr: round6(num(row.AK)),
    sKVA: round6(num(row.AL)),
    ibA: round6(num(row.AM)),
    voltage: vNom,
    parallelCables: num(row.X) || 1,
    cableSection: str(row.Y),
    spare: isRespeto(destId, destDesc),
    virtual: false,
    notes: NOTE,
  }

  existingIds.add(id)
  existingPair.add(pairKey)
  addedCircuits.push(circuit)
}

// Marcar equipos 400 Hz principales
for (const e of eqById.values()) {
  if (/^(MSB-4SFS|SCV-4SFS|SSB-[12]SFS|FIU-4SFS|TRF-[124]SFS)/i.test(e.id)) {
    if (!e.voltage || e.voltage === '230') e.voltage = '400Hz'
  }
}

file.equipment = [...eqById.values()]
file.circuits = [
  ...file.circuits.filter((c) => !String(c.id).startsWith(`${ID_PREFIX}-`)),
  ...addedCircuits,
]
file._comment =
  (file._comment || '') +
  ` | 400Hz Power System ${new Date().toISOString().slice(0, 10)}`

writeFileSync(jsonPath, JSON.stringify(file))
console.log(
  `OK 400Hz: +${addedEquipment.length} equipos, +${addedCircuits.length} circuitos (dup skip ${skippedDup})`,
)

for (const id of ['MSB-4SFS0001', 'MSB-4SFS0002', 'SCV-4SFS0001', 'SCV-4SFS0002']) {
  const feeds = file.circuits.filter((c) => !c.virtual && c.destinationId === id)
  const outs = file.circuits.filter((c) => !c.virtual && c.originId === id)
  console.log(
    id,
    `in=${feeds.length}`,
    feeds.slice(0, 4).map((c) => `${c.originId}/${c.protectionName}`).join(' | '),
    `| out=${outs.length}`,
  )
}
