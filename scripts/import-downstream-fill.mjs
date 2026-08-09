/**
 * Rellena todo lo desarrollable de Excel 440 / 230 / 115 / Lighting
 * a partir de equipos ya presentes en abtDownstream.json (TRF, SSB, paneles…).
 *
 * - Semilla = todo equipo del JSON que aparece como origen en la hoja
 * - BFS de destinos PUMA + INS/NSX + salidas
 * - Completa TRF-4PWS* → SSB-2PWS* (230) y TRF-4PWS* → SSB-1PWS* (115)
 * - Destinos hoja (SKT/LOP/MVP/JBX…) faltantes bajo orígenes ya conocidos
 * - Promueve FAC/FCP/FUP/UCP/CCM/FAP a cuadro_secundario si tienen salidas
 *
 * Uso: node scripts/import-downstream-fill.mjs
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
  console.error('No se encontró Excel descomprimido (.tmp/xlsm_unpacked/)')
  process.exit(1)
}

const INS_NOTE = 'ssb-incoming'

const SHEETS = [
  { file: 'worksheets/sheet2.xml', voltage: '440', prefix: 'abt-440', label: '440V' },
  { file: 'worksheets/sheet3.xml', voltage: '230', prefix: 'abt-230', label: '230V' },
  { file: 'worksheets/sheet4.xml', voltage: '115', prefix: 'abt-115', label: '115V' },
  { file: 'worksheets/sheet7.xml', voltage: '230', prefix: 'abt-ltg', label: 'Lighting' },
]

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
  // Solo reserva real; no bastan menciones laterales «(… Y SPARE)»
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
    /^(SSB|ABT|LCS|CCM|CSB|UPS|FAC|FCP|FUP|UCP|FAP|SBT)-/i.test(destId)
  )
    return 'cuadro_secundario'
  if (destId.startsWith('TBX-') || destId.startsWith('JBX-')) return 'consumidor'
  const d = (desc ?? '').toUpperCase()
  if (
    d.includes('CUADRO') ||
    d.includes('CENTRO DE CARGA') ||
    d.includes('CENTRO CONTROL') ||
    d.includes('PANEL CONTROL')
  )
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

function protectionSuffixFromRef(circuitRef) {
  const ref = String(circuitRef || '').trim()
  if (!ref) return null
  const m = ref.match(/(Q\d+(?:-\d+)+)$/i) || ref.match(/(Q\d+)$/i)
  if (m) return m[1]
  return ref.split('-').pop() || null
}

function isDualPanelDest(id) {
  return (
    /^(CCM-|FAC-VENT|FAP-VENT|FCP-ACON|FUP-ACON|UCP-ACON)/i.test(String(id)) &&
    !/^CCM-6PWS/i.test(String(id))
  )
}

const file = JSON.parse(readFileSync(jsonPath, 'utf8'))
const localMap = buildLocalMap()
const eqById = new Map(file.equipment.map((e) => [e.id, { ...e }]))
const circuitKeys = new Set(
  file.circuits.map(
    (c) => `${c.originId}|${c.circuitRef || c.protectionName}|${c.destinationId}`,
  ),
)

const seqByPrefix = new Map()
for (const c of file.circuits) {
  const m = String(c.id).match(/^(abt-(?:440|230|115|ltg))-(\d+)$/)
  if (!m) continue
  const cur = seqByPrefix.get(m[1]) ?? 1
  seqByPrefix.set(m[1], Math.max(cur, Number(m[2]) + 1))
}

const addedCircuits = []
const addedEquipment = []
let totalRows = 0

function nextId(prefix) {
  const n = seqByPrefix.get(prefix) ?? 1
  seqByPrefix.set(prefix, n + 1)
  return `${prefix}-${String(n).padStart(3, '0')}`
}

function ensureEquipment(id, { name, kind, voltage, local, spare, virtual, incomingSwitch }) {
  const prev = eqById.get(id)
  if (prev) {
    if (incomingSwitch && !prev.incomingSwitch) prev.incomingSwitch = incomingSwitch
    if (name && (prev.name === prev.id || !prev.name)) prev.name = name
    if (local && !prev.local) prev.local = local
    if (voltage && !prev.voltage) prev.voltage = voltage
    if (kind === 'cuadro_secundario' && prev.kind === 'consumidor' && isDualPanelDest(id)) {
      prev.kind = 'cuadro_secundario'
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

function circuitExists(origin, destId, circuitRef, protName) {
  if (circuitKeys.has(`${origin}|${circuitRef}|${destId}`)) return true
  return [...file.circuits, ...addedCircuits].some(
    (c) =>
      c.originId === origin &&
      c.destinationId === destId &&
      (c.circuitRef === circuitRef || c.protectionName === protName),
  )
}

for (const sheet of SHEETS) {
  const rows = parseSheet(join(base, sheet.file))
  const insMap = buildIncomingSwitchMap(rows)
  const byOrigin = new Map()
  for (const [rn, row] of rows) {
    const origin = str(row.E)
    if (!origin || !isPuma(origin)) continue
    if (!byOrigin.has(origin)) byOrigin.set(origin, [])
    byOrigin.get(origin).push({ rn, row })
  }

  // Semilla: equipos ya en JSON que son origen en esta hoja
  const seed = new Set()
  for (const id of eqById.keys()) {
    if (byOrigin.has(id)) seed.add(id)
  }
  // + destinos TRF/LCS que aún no están pero el Excel los enlaza desde un TRF del JSON
  for (const [origin, list] of byOrigin) {
    if (!eqById.has(origin)) continue
    if (!origin.startsWith('TRF-') && !origin.startsWith('LCS-')) continue
    for (const { row } of list) {
      const dest = str(row.I)
      if (dest && isPuma(dest)) seed.add(origin)
    }
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

  console.log(
    `\n[${sheet.label}] seeds=${seed.size} bfsNodes=${known.size} rows=${excelRows.length}`,
  )
  totalRows += excelRows.length

  for (const boardId of known) {
    const ins = insMap.get(boardId)
    if (!ins || !isIncomingSwitchName(ins.name)) continue
    const busId = `BUS-${boardId}`
    ensureEquipment(boardId, {
      name: eqById.get(boardId)?.name ?? boardId,
      kind: 'cuadro_secundario',
      voltage: sheet.voltage,
      local: localMap.get(boardId) ?? eqById.get(boardId)?.local ?? null,
      incomingSwitch: ins.name,
    })
    ensureEquipment(busId, {
      name: `Barra ${boardId}`,
      kind: 'cuadro_secundario',
      voltage: sheet.voltage,
      virtual: true,
    })
    const insKey = `${boardId}|${ins.name}|${busId}`
    if (!circuitKeys.has(insKey)) {
      circuitKeys.add(insKey)
      addedCircuits.push({
        id: nextId(sheet.prefix),
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
        voltage: sheet.voltage,
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

    if (circuitExists(origin, destId, circuitRef, protName)) continue

    // Evitar ciclos triviales origen↔destino (salvo TRF→SSB que se materializa)
    const createsCycle =
      [...file.circuits, ...addedCircuits].some(
        (c) => !c.virtual && c.originId === destId && c.destinationId === origin,
      )
    if (createsCycle && !(origin.startsWith('TRF-') && destId.startsWith('SSB-'))) {
      continue
    }
    // TRF→SSB que cierra ciclo con SSB→TRF interno: no duplicar si ya hay barra 115
    if (createsCycle && origin.startsWith('TRF-') && destId.startsWith('SSB-')) {
      const has115 = [...file.circuits, ...addedCircuits].some(
        (c) =>
          c.originId === origin &&
          (c.notes === 'ssb-115-bus' || c.destinationId === `BUS-${destId}-115`),
      )
      if (has115) continue
      // Si no es el patrón interno 115, saltar el ciclo
      if (
        [...file.circuits, ...addedCircuits].some(
          (c) => c.originId === destId && c.destinationId === origin,
        )
      ) {
        // secundaria 230/115 normal no debería ciclar; si cicla, skip
        continue
      }
    }

    const local =
      destLocalRaw && destLocalRaw !== 'NaN'
        ? destLocalRaw
        : localMap.get(destId) ?? null

    ensureEquipment(destId, {
      name: spare ? 'RESPETO' : destDesc || destId,
      kind: kindOf(destId, destDesc),
      voltage: sheet.voltage,
      local: spare ? null : local,
      spare,
      virtual: false,
    })

    const ins = insMap.get(origin)
    if (ins && isIncomingSwitchName(ins.name)) {
      ensureEquipment(origin, {
        name: eqById.get(origin)?.name ?? origin,
        kind: 'cuadro_secundario',
        voltage: sheet.voltage,
        local: localMap.get(origin) ?? null,
        incomingSwitch: ins.name,
      })
    }

    let pKWe = round6(num(row.AJ))
    let qKVAr = round6(num(row.AK))
    let sKVA = round6(num(row.AL))
    let ibA = round6(num(row.AM))
    const pnKW = round6(num(row.O))
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

    circuitKeys.add(`${origin}|${circuitRef}|${destId}`)
    addedCircuits.push({
      id: nextId(sheet.prefix),
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
      voltage: sheet.voltage,
      parallelCables: num(row.X),
      cableSection: sectionOk ? cableSection : null,
      spare: !!spare,
      virtual: false,
    })
  }

  // Dual feeds NV → alternativa
  const all = [...file.circuits, ...addedCircuits]
  const byDest = new Map()
  for (const c of all) {
    if (c.virtual || !isDualPanelDest(c.destinationId)) continue
    if (!byDest.has(c.destinationId)) byDest.set(c.destinationId, [])
    byDest.get(c.destinationId).push(c)
  }
  for (const [, list] of byDest) {
    const origins = new Set(list.map((c) => c.originId))
    if (origins.size < 2) continue
    if (list.some((c) => c.lineType === 'alternativa')) continue
    const alts = list.filter((c) => c.service === 'NV')
    for (const c of alts.length ? alts : list.slice(1)) c.lineType = 'alternativa'
  }
}

// Promover paneles con salidas a cuadro_secundario
let promoted = 0
for (const e of eqById.values()) {
  if (!isDualPanelDest(e.id)) continue
  const outs = [...file.circuits, ...addedCircuits].some(
    (c) => c.originId === e.id && !c.virtual,
  )
  if (outs && e.kind !== 'cuadro_secundario') {
    e.kind = 'cuadro_secundario'
    promoted++
  }
}

file.equipment = [...eqById.values()]
file.circuits = [...file.circuits, ...addedCircuits]
file._comment =
  (file._comment || '') +
  ` | Fill 440/230/115/Lighting ${new Date().toISOString().slice(0, 10)}`

writeFileSync(jsonPath, JSON.stringify(file, null, 4) + '\n')
console.log('\nAdded equipment:', addedEquipment.length)
console.log('Added circuits:', addedCircuits.length)
console.log('Panels promoted to cuadro:', promoted)
console.log('Excel rows walked:', totalRows)
console.log('Wrote', jsonPath)
