/**
 * Importa alumbrado aguas abajo de LCS-4PWS0001 (Excel «Lighting»).
 *
 * - BFS desde salidas LCS-0001 a SSB-2LGS / 2ELG / 2LGE y TRF-2LGE
 * - INS + barra virtual en cuadros de alumbrado
 * - Salidas a nodos ISA / subcuadros / cargas
 *
 * Uso:
 *   node scripts/import-lcs0001-downstream-lighting.mjs [LCS-4PWS000N]
 *   node scripts/import-lcs0001-downstream-lighting.mjs LCS-4PWS0002
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

const LCS = process.argv[2] || 'LCS-4PWS0001'
if (!/^LCS-4PWS000[1-6]$/.test(LCS)) {
  console.error(
    'Uso: node scripts/import-lcs0001-downstream-lighting.mjs LCS-4PWS000N',
  )
  process.exit(1)
}
const INS_NOTE = 'ssb-incoming'
const VOLTAGE = '230'
const ID_PREFIX = 'abt-ltg'

/** Cuadros / trafos de alumbrado (Lighting). */
function isLightingBoard(id) {
  return (
    /^SSB-2(LGS|ELG|LGE)/i.test(String(id)) ||
    /^TRF-2LGE/i.test(String(id))
  )
}

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
  if (destId.startsWith('TRF-') || destId.startsWith('XFMR')) return 'conversion'
  if (
    destId.startsWith('SSB-') ||
    destId.startsWith('ABT-') ||
    destId.startsWith('LCS-') ||
    destId.startsWith('CCM-') ||
    destId.startsWith('CSB-') ||
    destId.startsWith('UPS-')
  )
    return 'cuadro_secundario'
  if (destId.startsWith('ISA-')) return 'consumidor'
  if (destId.startsWith('TBX-') || destId.startsWith('JBX-')) return 'consumidor'
  const d = (desc ?? '').toUpperCase()
  if (d.includes('CUADRO') || d.includes('CENTRO DE CARGA'))
    return 'cuadro_secundario'
  if (d.includes('TRANSFORMADOR')) return 'conversion'
  return 'consumidor'
}

function serviceOf(v) {
  const s = str(v)
  if (s === 'VS' || s === 'VM' || s === 'NV') return s
  return 'VS'
}

function lineTypeOf(row) {
  const m = str(row.M)
  if (m === 'Alternative' || m === 'Alternativa') return 'alternativa'
  return 'normal'
}

function buildLocalMap() {
  const report = parseSheet(join(base, 'worksheets/sheet15.xml'))
  const map = new Map()
  for (const [, row] of report) {
    const puma = row.B
    if (!isPuma(puma)) continue
    const h = str(row.H)
    if (!h) continue
    const loc = h.includes(' ') ? h.slice(0, h.indexOf(' ')) : h
    if (!map.has(puma)) map.set(puma, loc)
  }
  return map
}

function buildIncomingSwitchMap(rows) {
  const map = new Map()
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0])
  for (const [rn, row] of sorted) {
    if (str(row.E) !== 'Incoming Power Switch:') continue
    const ins = str(row.F)
    if (!ins || ins === '0' || ins === '-') continue
    if (!/^INS\s*\d{2,3}$/i.test(ins) && !/^NSX\b/i.test(ins)) continue
    let boardId = null
    for (let i = rn + 1; i <= rn + 10; i++) {
      const r = rows.get(i)
      if (!r) continue
      if (str(r.D) === 'Circuit') continue
      const origin = str(r.E)
      if (origin && isPuma(origin)) {
        boardId = origin
        break
      }
    }
    if (boardId) map.set(boardId, { name: ins.replace(/\s+/g, ' ').trim(), excelRow: rn })
  }
  return map
}

function isIncomingSwitchName(name) {
  return /^INS\s*\d{2,3}$/i.test(String(name ?? '')) || /^NSX\b/i.test(String(name ?? ''))
}

function parseInsRating(name) {
  const m = String(name).match(/INS\s*(\d{2,3})/i)
  if (m) return Number(m[1])
  const n = String(name).match(/(\d{2,3})/)
  return n ? Number(n[1]) : null
}

const file = JSON.parse(readFileSync(jsonPath, 'utf8'))
const localMap = buildLocalMap()
const rows = parseSheet(join(base, 'worksheets/sheet7.xml'))
const insMap = buildIncomingSwitchMap(rows)

const seed = new Set(
  file.circuits
    .filter(
      (c) =>
        c.originId === LCS &&
        !c.virtual &&
        isLightingBoard(c.destinationId),
    )
    .map((c) => c.destinationId),
)

console.log(`Seed ${LCS} lighting:`, [...seed].sort().join(', ') || '(none)')

const byOrigin = new Map()
for (const [rn, row] of rows) {
  const origin = str(row.E)
  if (!origin || !isPuma(origin)) continue
  if (!byOrigin.has(origin)) byOrigin.set(origin, [])
  byOrigin.get(origin).push({ rn, row })
}

const known = new Set(seed)
const queue = [...seed]
const excelRows = []
while (queue.length) {
  const id = queue.shift()
  for (const { rn, row } of byOrigin.get(id) ?? []) {
    excelRows.push({ rn, row, origin: id })
    const dest = str(row.I)
    if (dest && isPuma(dest) && !known.has(dest)) {
      known.add(dest)
      queue.push(dest)
    }
  }
}

console.log('Excel downstream rows:', excelRows.length)

const eqById = new Map(file.equipment.map((e) => [e.id, { ...e }]))
const circuitKeys = new Set(
  file.circuits.map(
    (c) => `${c.originId}|${c.circuitRef || c.protectionName}|${c.destinationId}`,
  ),
)

let seq = 1
for (const c of file.circuits) {
  const m = String(c.id).match(/^abt-ltg-(\d+)$/)
  if (m) seq = Math.max(seq, Number(m[1]) + 1)
}

const addedCircuits = []
const addedEquipment = []

function ensureEquipment(id, { name, kind, voltage, local, spare, virtual, incomingSwitch }) {
  const prev = eqById.get(id)
  if (prev) {
    if (incomingSwitch && !prev.incomingSwitch) prev.incomingSwitch = incomingSwitch
    if (name && (prev.name === prev.id || !prev.name)) prev.name = name
    if (local && !prev.local) prev.local = local
    if (voltage && (!prev.voltage || prev.voltage === '440')) {
      // no pisar 440 si el equipo es dual; solo rellenar vacío
      if (!prev.voltage) prev.voltage = voltage
    }
    return prev
  }
  const eq = {
    id,
    name: name || id,
    kind,
    voltage: voltage ?? null,
    local: local ?? null,
    spare: !!spare,
    virtual: !!virtual,
  }
  if (incomingSwitch) eq.incomingSwitch = incomingSwitch
  eqById.set(id, eq)
  addedEquipment.push(eq)
  return eq
}

// Interruptor de entrada + barra virtual por cuadro
for (const boardId of known) {
  const ins = insMap.get(boardId)
  if (!ins || !isIncomingSwitchName(ins.name)) continue

  const busId = `BUS-${boardId}`
  ensureEquipment(boardId, {
    name: eqById.get(boardId)?.name ?? boardId,
    kind: 'cuadro_secundario',
    voltage: VOLTAGE,
    local: localMap.get(boardId) ?? eqById.get(boardId)?.local ?? null,
    incomingSwitch: ins.name,
  })
  ensureEquipment(busId, {
    name: `Barra ${boardId}`,
    kind: 'cuadro_secundario',
    voltage: VOLTAGE,
    virtual: true,
  })

  const insKey = `${boardId}|${ins.name}|${busId}`
  if (!circuitKeys.has(insKey)) {
    circuitKeys.add(insKey)
    addedCircuits.push({
      id: `${ID_PREFIX}-${String(seq++).padStart(3, '0')}`,
      excelRow: ins.excelRow,
      circuitRef: `${boardId}-${ins.name.replace(/\s+/g, '')}`,
      name: `${boardId} → ${busId}`,
      originId: boardId,
      destinationId: busId,
      lineType: 'normal',
      service: 'VS',
      protectionName: ins.name,
      protectionModel: ins.name,
      protectionCurrentA: parseInsRating(ins.name),
      voltage: VOLTAGE,
      spare: false,
      virtual: false,
      notes: INS_NOTE,
    })
  }
}

for (const { rn, row, origin } of excelRows) {
  const circuitRef = str(row.D)
  const destRaw = row.I
  const destDesc = str(row.L)
  const destLocalRaw = str(row.K)
  if (!circuitRef) continue

  const spare = isRespeto(destRaw, destDesc)
  let destId
  if (spare) {
    const brk = str(row.AD) || circuitRef.split('-').pop()
    destId = `SPARE-${origin}-${String(brk).replace(/[^A-Za-z0-9-]/g, '')}`
  } else if (isPuma(destRaw)) {
    destId = destRaw
  } else {
    const brk = str(row.AD) || 'X'
    destId = `SPARE-${origin}-${String(brk).replace(/[^A-Za-z0-9-]/g, '')}`
  }

  const protFromRef = protectionSuffixFromRef(circuitRef)
  const adRaw = str(row.AD)
  const adLooksBreaker =
    adRaw && !/^\d+([.,]\d+)?$/.test(adRaw) && !/^NaN$/i.test(adRaw)
  const protName = (adLooksBreaker ? adRaw : null) || protFromRef || '?'

  if (circuitKeys.has(`${origin}|${circuitRef}|${destId}`)) continue
  if (
    file.circuits.some(
      (c) =>
        c.originId === origin &&
        c.destinationId === destId &&
        (c.circuitRef === circuitRef || c.protectionName === protName),
    )
  ) {
    continue
  }

  // Evitar ciclos A↔B
  const createsCycle =
    file.circuits.some(
      (c) => !c.virtual && c.originId === destId && c.destinationId === origin,
    ) ||
    addedCircuits.some((c) => c.originId === destId && c.destinationId === origin)
  if (createsCycle) {
    console.warn(`Skip ciclo ${origin} → ${destId} (excel row ${rn}, ${circuitRef})`)
    continue
  }

  circuitKeys.add(`${origin}|${circuitRef}|${destId}`)

  const local =
    destLocalRaw && destLocalRaw !== 'NaN'
      ? destLocalRaw
      : localMap.get(destId) ?? null

  ensureEquipment(destId, {
    name: spare ? 'RESPETO' : destDesc || destId,
    kind: kindOf(destId, destDesc),
    voltage: VOLTAGE,
    local: spare ? null : local,
    spare,
    virtual: false,
  })

  const ins = insMap.get(origin)
  if (ins && isIncomingSwitchName(ins.name)) {
    ensureEquipment(origin, {
      name: eqById.get(origin)?.name ?? origin,
      kind: 'cuadro_secundario',
      voltage: VOLTAGE,
      local: localMap.get(origin) ?? null,
      incomingSwitch: ins.name,
    })
  }

  let pKWe = round6(num(row.AJ))
  let qKVAr = round6(num(row.AK))
  let sKVA = round6(num(row.AL))
  let ibA = round6(num(row.AM))
  let pnKW = round6(num(row.O))
  if (spare && pKWe != null && pKWe > 5000) {
    pKWe = null
    qKVAr = null
    sKVA = null
    ibA = null
  }

  const cableSection = str(row.Y)
  const sectionOk =
    cableSection &&
    !/^P2/i.test(cableSection) &&
    (/^\d/.test(cableSection) || cableSection.includes('×'))

  addedCircuits.push({
    id: `${ID_PREFIX}-${String(seq++).padStart(3, '0')}`,
    excelRow: rn,
    circuitRef,
    name: `${origin} → ${destId}`,
    originId: origin,
    destinationId: destId,
    lineType: lineTypeOf(row),
    service: serviceOf(row.N),
    protectionName: protName,
    protectionModel: str(row.AE),
    protectionCurrentA: num(row.AF),
    pnKW,
    pKWe,
    qKVAr,
    sKVA,
    ibA,
    voltage: VOLTAGE,
    parallelCables: num(row.X),
    cableSection: sectionOk ? cableSection : null,
    spare: !!spare,
    virtual: false,
  })
}

function isDualPanelDest(id) {
  return (
    /^(CCM-|FAC-VENT|FCP-ACON|FUP-ACON|UCP-ACON)/i.test(String(id)) &&
    !/^CCM-6PWS/i.test(String(id))
  )
}

function markPanelDualFeeds() {
  const all = [...file.circuits, ...addedCircuits]
  const byDest = new Map()
  for (const c of all) {
    if (c.virtual || !isDualPanelDest(c.destinationId)) continue
    if (!byDest.has(c.destinationId)) byDest.set(c.destinationId, [])
    byDest.get(c.destinationId).push(c)
  }
  let n = 0
  for (const [, list] of byDest) {
    const origins = new Set(list.map((c) => c.originId))
    if (origins.size < 2) continue
    if (list.some((c) => c.lineType === 'alternativa')) continue
    const alts = list.filter((c) => c.service === 'NV')
    for (const c of alts.length ? alts : list.slice(1)) {
      c.lineType = 'alternativa'
      n++
    }
  }
  if (n) console.log(`Panel dual feeds → alternativa: ${n}`)
}

function protectionSuffixFromRef(circuitRef) {
  const ref = String(circuitRef || '').trim()
  if (!ref) return null
  const m = ref.match(/(Q\d+(?:-\d+)+)$/i) || ref.match(/(Q\d+)$/i)
  if (m) return m[1]
  return ref.split('-').pop() || null
}

function fixNumericProtectionNames() {
  let n = 0
  for (const c of [...file.circuits, ...addedCircuits]) {
    if (!/^\d+([.,]\d+)?$/.test(String(c.protectionName ?? ''))) continue
    const fromRef = protectionSuffixFromRef(c.circuitRef)
    if (!fromRef || fromRef === String(c.protectionName)) continue
    c.protectionName = fromRef
    n++
  }
  if (n) console.log(`Outlet breakers from circuitRef: ${n}`)
}

markPanelDualFeeds()
fixNumericProtectionNames()

file.equipment = [...eqById.values()]
file.circuits = [...file.circuits, ...addedCircuits]
file._comment =
  (file._comment || '') +
  ` | Downstream Lighting ${LCS} (2LGS/2ELG/2LGE) ${new Date().toISOString().slice(0, 10)}`

writeFileSync(jsonPath, JSON.stringify(file, null, 4) + '\n')
console.log('Added equipment:', addedEquipment.length)
console.log('Added circuits:', addedCircuits.length)
console.log(
  'INS boards:',
  [...insMap.entries()]
    .filter(([id, v]) => known.has(id) && isIncomingSwitchName(v.name))
    .map(([id, v]) => `${id}:${v.name}`)
    .join(', '),
)
console.log('Wrote', jsonPath)
