/**
 * Importa «24V Power System» (Excel sheet6) → abtDownstream.json
 *
 * - RCT-24PW* → MSB-24PW* = normal
 * - MSB-24PW* ↔ MSB-24PW* = alternativa (cualquier Q; bidireccional)
 * - Resto: col. M (Normal / Alternative)
 * - SSB-24PW* con Incoming Power Switch INS/NSX + barra virtual
 *
 * Uso: node scripts/import-24v-power.mjs
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

const INS_NOTE = 'ssb-incoming'
const VOLTAGE = '24'
const ID_PREFIX = 'abt-24'

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

function isMsb24(id) {
  return /^MSB-24PW/i.test(String(id ?? ''))
}

function isRct24(id) {
  return /^RCT-24PW/i.test(String(id ?? ''))
}

function kindOf(destId, desc) {
  if (destId.startsWith('BUS-')) return 'cuadro_secundario'
  if (isRespeto(destId, desc)) return 'consumidor'
  if (isRct24(destId)) return 'conversion'
  if (isMsb24(destId)) return 'cuadro_secundario'
  if (
    /^(SSB|ABT|LCS|CCM|CSB|UPS|FAC|FCP|FUP|UCP|FAP|SBT)-/i.test(destId)
  )
    return 'cuadro_secundario'
  if (destId.startsWith('TBX-') || destId.startsWith('JBX-')) return 'consumidor'
  const d = (desc ?? '').toUpperCase()
  if (
    d.includes('CUADRO') ||
    d.includes('CENTRO DE CARGA') ||
    d.includes('RECTIFICADOR') ||
    d.includes('FUENTE DE ALIMENTACION')
  ) {
    if (d.includes('RECTIFICADOR')) return 'conversion'
    if (d.includes('CUADRO') || d.includes('CENTRO DE CARGA'))
      return 'cuadro_secundario'
  }
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

function protectionSuffixFromRef(circuitRef) {
  const ref = String(circuitRef || '').trim()
  if (!ref) return null
  const m = ref.match(/(Q\d+(?:-\d+)+)$/i) || ref.match(/(Q\d+)$/i)
  if (m) return m[1]
  return ref.split('-').pop() || null
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

/** Nombre canónico PUMA ← Main Equipment Report (col. D). */
function buildPumaNameMap() {
  const report = parseSheet(join(base, 'worksheets/sheet15.xml'))
  const map = new Map()
  for (const [, row] of report) {
    const puma = row.B
    if (!isPuma(puma)) continue
    const name = str(row.D)
    if (name && !map.has(puma)) map.set(puma, name)
  }
  return map
}

function descConflictsWithName(desc, name) {
  if (!desc || !name) return false
  const d = desc.toUpperCase()
  const n = name.toUpperCase()
  const stop = new Set([
    'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'N', 'Y', 'PARA', 'THE', 'OF', 'AND',
  ])
  const words = n
    .split(/[^A-Z0-9ÁÉÍÓÚÑ]+/)
    .map((w) => w.normalize('NFD').replace(/\p{M}/gu, ''))
    .filter((w) => w.length > 2 && !stop.has(w))
  if (words.length === 0) return false
  const dNorm = d.normalize('NFD').replace(/\p{M}/gu, '')
  return !words.some((w) => dNorm.includes(w))
}

/**
 * Col. I = PUMA; col. J = a menudo DCP. Si I y J son ambos PUMA distintos y el
 * nombre de I contradice la descripción (L), usar J (p. ej. FFS-AFFF vs FFS-CIE).
 */
function resolveDestId(row, pumaNames) {
  const i = str(row.I)
  const j = str(row.J)
  const desc = str(row.L)
  if (!isPuma(i)) return i
  if (!isPuma(j) || j === i) return i
  const nameI = pumaNames.get(i)
  if (nameI && descConflictsWithName(desc, nameI)) {
    return j
  }
  return i
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

function forcedLineType(originId, destId, excelLineType) {
  if (isRct24(originId) && isMsb24(destId)) return 'normal'
  if (isMsb24(originId) && isMsb24(destId)) return 'alternativa'
  return excelLineType
}

const file = JSON.parse(readFileSync(jsonPath, 'utf8'))
const localMap = buildLocalMap()
const pumaNames = buildPumaNameMap()
const rows = parseSheet(join(base, 'worksheets/sheet6.xml'))
const insMap = buildIncomingSwitchMap(rows)

const eqById = new Map(file.equipment.map((e) => [e.id, { ...e }]))
const circuitKeys = new Set(
  file.circuits.map(
    (c) => `${c.originId}|${c.circuitRef || c.protectionName}|${c.destinationId}`,
  ),
)
let nextSeq =
  Math.max(
    0,
    ...file.circuits
      .map((c) => {
        const m = String(c.id).match(/abt-24-(\d+)/)
        return m ? Number(m[1]) : 0
      }),
    ...file.circuits
      .map((c) => {
        const m = String(c.id).match(/abt-\d+-(\d+)/)
        return m ? Number(m[1]) : 0
      }),
  ) + 1

function nextId() {
  const id = `${ID_PREFIX}-${String(nextSeq).padStart(4, '0')}`
  nextSeq++
  return id
}

const addedCircuits = []
const addedEquipment = []

function ensureEquipment(id, patch) {
  const prev = eqById.get(id)
  if (prev) {
    const next = { ...prev }
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') continue
      if (k === 'kind' && isRct24(id)) {
        next.kind = 'conversion'
        continue
      }
      if (k === 'kind' && isMsb24(id)) {
        next.kind = 'cuadro_secundario'
        continue
      }
      if (k === 'incomingSwitch' && v) next.incomingSwitch = v
      else if (k === 'name' && (!prev.name || prev.name === id)) next.name = v
      else if (k === 'voltage' && !prev.voltage) next.voltage = v
      else if (k === 'local' && !prev.local) next.local = v
      else if (k === 'kind' && prev.kind === 'consumidor' && v !== 'consumidor')
        next.kind = v
      else if (!(k in next) || next[k] == null || next[k] === '') next[k] = v
    }
    if (isRct24(id)) next.kind = 'conversion'
    if (isMsb24(id)) next.kind = 'cuadro_secundario'
    eqById.set(id, next)
    return next
  }
  const eq = {
    id,
    name: patch.name || id,
    kind: patch.kind || 'consumidor',
    voltage: patch.voltage || VOLTAGE,
    local: patch.local ?? null,
    ...(patch.incomingSwitch ? { incomingSwitch: patch.incomingSwitch } : {}),
    ...(patch.virtual ? { virtual: true } : {}),
  }
  if (isRct24(id)) eq.kind = 'conversion'
  if (isMsb24(id)) eq.kind = 'cuadro_secundario'
  eqById.set(id, eq)
  addedEquipment.push(eq)
  return eq
}

function circuitExists(origin, destId, circuitRef, protName) {
  if (circuitKeys.has(`${origin}|${circuitRef}|${destId}`)) return true
  return [...file.circuits, ...addedCircuits].some(
    (c) =>
      c.originId === origin &&
      c.destinationId === destId &&
      (c.circuitRef === circuitRef || c.protectionName === protName),
  )
}

const byOrigin = new Map()
for (const [rn, row] of rows) {
  const origin = str(row.E)
  if (!origin || !isPuma(origin)) continue
  if (!byOrigin.has(origin)) byOrigin.set(origin, [])
  byOrigin.get(origin).push({ rn, row })
}

// Semilla: RCT/MSB ya en JSON + todos los orígenes PUMA de la hoja 24 V
const seed = new Set()
for (const id of eqById.keys()) {
  if (byOrigin.has(id) || isRct24(id) || isMsb24(id)) seed.add(id)
}
for (const origin of byOrigin.keys()) seed.add(origin)

const known = new Set(seed)
const queue = [...seed]
const excelRows = []
let destResolved = 0
while (queue.length) {
  const id = queue.shift()
  for (const { rn, row } of byOrigin.get(id) ?? []) {
    excelRows.push({ rn, row, origin: id })
    const dest = resolveDestId(row, pumaNames)
    if (dest && dest !== str(row.I)) destResolved++
    if (dest && isPuma(dest) && !known.has(dest)) {
      known.add(dest)
      queue.push(dest)
    }
  }
}

console.log(
  `[24V] seeds=${seed.size} bfsNodes=${known.size} rows=${excelRows.length} insBoards=${insMap.size} destJ=${destResolved}`,
)

// INS + barra para SSB-24 (y otros con Incoming Power Switch)
for (const boardId of known) {
  const ins = insMap.get(boardId)
  if (!ins || !isIncomingSwitchName(ins.name)) continue
  const busId = `BUS-${boardId}`
  const boardName =
    eqById.get(boardId)?.name ??
    (boardId.startsWith('SSB-')
      ? `CUADRO SECUNDARIO 24VDC`
      : boardId)
  ensureEquipment(boardId, {
    name: boardName,
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
      id: nextId(),
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

let skippedDup = 0
for (const { rn, row, origin } of excelRows) {
  const circuitRef = str(row.D)
  const destResolvedId = resolveDestId(row, pumaNames)
  const destRaw = destResolvedId ?? row.I
  const destDesc = str(row.L)
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

  if (circuitExists(origin, destId, circuitRef, protName)) {
    skippedDup++
    // Actualizar lineType en circuitos ya existentes (RCT/MSB rules)
    const existing = [...file.circuits, ...addedCircuits].find(
      (c) =>
        c.originId === origin &&
        c.destinationId === destId &&
        (c.circuitRef === circuitRef || c.protectionName === protName),
    )
    if (existing) {
      const forced = forcedLineType(origin, destId, lineTypeOf(row))
      if (existing.lineType !== forced) existing.lineType = forced
    }
    continue
  }

  // Permitir MSB↔MSB bidireccional; bloquear otros ciclos triviales
  const createsCycle = [...file.circuits, ...addedCircuits].some(
    (c) => !c.virtual && c.originId === destId && c.destinationId === origin,
  )
  if (createsCycle && !(isMsb24(origin) && isMsb24(destId))) {
    continue
  }

  const originName =
    str(row.H) ||
    (isRct24(origin)
      ? `RECTIFICADOR 24VDC`
      : isMsb24(origin)
        ? `CUADRO PRINCIPAL 24VDC`
        : origin)
  ensureEquipment(origin, {
    name: originName,
    kind: kindOf(origin, originName),
    voltage: VOLTAGE,
    local: localMap.get(origin) ?? null,
  })

  const destName = destDesc || destId
  ensureEquipment(destId, {
    name: spare ? 'RESPETO' : destName,
    kind: kindOf(destId, destDesc),
    voltage: VOLTAGE,
    local: localMap.get(destId) ?? str(row.K) ?? null,
  })

  const lineType = forcedLineType(origin, destId, lineTypeOf(row))
  const currentA = num(row.AE) ?? num(row.AD)
  const model = str(row.AE) && !/^\d+([.,]\d+)?$/.test(str(row.AE)) ? str(row.AE) : null

  circuitKeys.add(`${origin}|${circuitRef}|${destId}`)
  addedCircuits.push({
    id: nextId(),
    excelRow: rn,
    circuitRef,
    name: `${origin} → ${destId}`,
    originId: origin,
    destinationId: destId,
    lineType,
    service: serviceOf(row.N),
    protectionName: protName,
    protectionModel: model,
    protectionCurrentA: round6(currentA),
    voltage: VOLTAGE,
    spare,
    virtual: false,
    notes:
      isMsb24(origin) && isMsb24(destId)
        ? 'msb24-interconnect'
        : isAux24Dest(destId)
          ? 'aux-24'
          : null,
  })
}

function isAux24Dest(id) {
  return (
    /^LCS-/i.test(String(id)) ||
    /^CCM-/i.test(String(id)) ||
    /^MSB-6PWS/i.test(String(id)) ||
    /^PNL-MSB[12]000$/i.test(String(id))
  )
}

function isPowerVolt(c) {
  if (c.virtual) return false
  const v = String(c.voltage ?? '')
    .replace(/\s*V$/i, '')
    .trim()
  if (v === '24' || v.startsWith('24')) return false
  return (
    v.startsWith('690') ||
    v.startsWith('440') ||
    v.startsWith('230') ||
    v.startsWith('115')
  )
}

// Forzar lineType en todos los circuitos 24 V / RCT↔MSB / MSB↔MSB del archivo
let forced = 0
for (const c of [...file.circuits, ...addedCircuits]) {
  if (c.virtual) continue
  const next = forcedLineType(c.originId, c.destinationId, c.lineType)
  if (
    (isRct24(c.originId) && isMsb24(c.destinationId)) ||
    (isMsb24(c.originId) && isMsb24(c.destinationId))
  ) {
    if (c.lineType !== next) {
      c.lineType = next
      forced++
    }
    if (isMsb24(c.originId) && isMsb24(c.destinationId) && !c.notes) {
      c.notes = 'msb24-interconnect'
    }
  }
}

/**
 * AUX 24 V: LCS/CCM/MSB tipificados, o cualquier 24 V a un equipo que ya
 * tiene acometida de potencia 690/440/230/115 (p. ej. STA-SWFS / STA-CIS).
 * No son alternativas de potencia.
 */
const system690Path = join(root, 'src/data/system690.json')
const system690 = existsSync(system690Path)
  ? JSON.parse(readFileSync(system690Path, 'utf8'))
  : { circuits: [] }
const allCircuits = [...file.circuits, ...addedCircuits]
const powerPool = [...(system690.circuits || []), ...allCircuits]
const byDest = new Map()
for (const c of powerPool) {
  if (c.virtual) continue
  if (!byDest.has(c.destinationId)) byDest.set(c.destinationId, [])
  byDest.get(c.destinationId).push(c)
}
let auxN = 0
for (const c of allCircuits) {
  if (c.virtual || String(c.voltage) !== VOLTAGE) continue
  if (c.notes === 'msb24-interconnect') continue
  const siblings = byDest.get(c.destinationId) ?? []
  const hasPower = siblings.some((x) => x.id !== c.id && isPowerVolt(x))
  if (isAux24Dest(c.destinationId) || hasPower) {
    c.notes = 'aux-24'
    c.lineType = 'normal'
    auxN++
  }
}
console.log(`AUX 24V (maniobra/control): ${auxN}`)

// Promover RCT existentes a conversion
for (const e of eqById.values()) {
  if (isRct24(e.id)) e.kind = 'conversion'
  if (isMsb24(e.id)) e.kind = 'cuadro_secundario'
}

file.equipment = [...eqById.values()]
file.circuits = [...file.circuits, ...addedCircuits]
file._comment =
  (file._comment || '') +
  ` | 24V Power System ${new Date().toISOString().slice(0, 10)}`

writeFileSync(jsonPath, JSON.stringify(file))
console.log(
  `OK: +${addedEquipment.length} equipos, +${addedCircuits.length} circuitos (dup skip ${skippedDup}, lineType forced ${forced})`,
)

// Resumen MSB feeds
for (let i = 1; i <= 8; i++) {
  const id = `MSB-24PW000${i}`
  const feeds = file.circuits.filter(
    (c) => !c.virtual && c.destinationId === id,
  )
  if (!feeds.length) continue
  console.log(
    id,
    feeds.map((c) => `${c.originId}/${c.protectionName}/${c.lineType}`).join(' | '),
  )
}
