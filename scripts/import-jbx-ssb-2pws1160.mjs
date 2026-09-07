/**
 * Desarrolla JBX + SKT (+ equipos dedicados) aguas abajo de SSB-2PWS1160
 * desde Excel «Junction Boxes» + «Sockets».
 *
 * @deprecated Preferir `import-jbx-all-chains.mjs` (todos los SSB).
 * Uso: node scripts/import-jbx-ssb-2pws1160.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'src/data/abtDownstream.json')
const XL_BASE = path.join(ROOT, '.tmp/xlsm_unpack/unpacked/xl')
const NOTE = 'jbx-chain-1160'
const SSB = 'SSB-2PWS1160'

const ssXml = fs.readFileSync(path.join(XL_BASE, 'sharedStrings.xml'), 'utf8')
const strings = []
for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  strings.push(
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''),
  )
}

function parseSheet(rel) {
  const xml = fs.readFileSync(path.join(XL_BASE, rel), 'utf8')
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
    if (/t="s"/.test(attrs)) val = strings[+v] ?? v
    else if (/^-?\d/.test(v)) val = Number(v)
    if (!rows.has(row)) rows.set(row, {})
    rows.get(row)[col] = val
  }
  return rows
}

function str(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (!s || s === 'NaN' || s === '#N/A' || s === '-' || s === '#¡VALOR!')
    return null
  return s
}

function num(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Extrae tag PUMA desde celda/descripcion Excel. */
function resolveTag(raw, desc) {
  const t = str(raw)
  if (t && /^(JBX|SKT|[A-Z]{2,4}-[A-Z0-9]+)/i.test(t) && !/^\d+$/.test(t)) {
    return t
  }
  // Índice sharedString metido como número en col. TAG
  if (t && /^\d+$/.test(t) && strings[+t]) {
    const resolved = strings[+t]
    const m = resolved.match(
      /\b([A-Z]{2,4}-[A-Z]{2,6}\d{3,4})\b/i,
    )
    if (m) return m[1].toUpperCase()
    if (/^JBX-|^SKT-/i.test(resolved)) return resolved
  }
  const blob = `${t || ''} ${desc || ''}`
  const m = blob.match(/\b([A-Z]{2,4}-[A-Z]{2,6}\d{3,4})\b/i)
  return m ? m[1].toUpperCase() : null
}

function isJbxTag(tag, desc) {
  if (tag && /^JBX-/i.test(tag)) return true
  return /CAJA DE CONEX/i.test(desc || '')
}

function isSktTag(tag) {
  return !!(tag && /^SKT-/i.test(tag))
}

/**
 * Padre topológico por sufijo de circuito (patrón Q06):
 *  - 10 / 20 / 30 → interconexión JBX (10 cuelga del root, 20 de 10…)
 *  - 11–19 / 01–09 → hijos del root (salvo carga no-SKT 11–19 con JBX-10)
 *  - 21–29 → hijos del JBX-10; 31–39 → del JBX-20
 */
function parentCircuitRef(feederRef, suffix, opts) {
  const n = parseInt(suffix, 10)
  if (Number.isNaN(n)) return feederRef
  const tens = Math.floor(n / 10)
  const ones = n % 10
  if (ones === 0) {
    return tens <= 1 ? feederRef : `${feederRef}-${(tens - 1) * 10}`
  }
  // Módulos / cargas no-SKT bajo JBX-10 (p.ej. Q08-11 PMP-*)
  if (
    tens === 1 &&
    opts?.nonSktUnder10 &&
    opts.jbxHas10
  ) {
    return `${feederRef}-10`
  }
  if (tens <= 1) return feederRef
  return `${feederRef}-${(tens - 1) * 10}`
}

const file = JSON.parse(fs.readFileSync(OUT, 'utf8'))

function ensureEq(id, patch) {
  let eq = file.equipment.find((e) => e.id === id)
  if (!eq) {
    eq = { id, ...patch }
    file.equipment.push(eq)
  } else {
    Object.assign(eq, patch)
  }
  return eq
}

function upsertCircuit(c) {
  const i = file.circuits.findIndex(
    (x) => x.id === c.id || (c.circuitRef && x.circuitRef === c.circuitRef),
  )
  if (i >= 0) file.circuits[i] = { ...file.circuits[i], ...c }
  else file.circuits.push(c)
}

// Limpiar imports previos de esta cadena
const before = file.circuits.length
file.circuits = file.circuits.filter(
  (c) => c.notes !== NOTE && c.notes !== 'jbx-chain-1160-q06',
)
console.log('Removed previous chain circuits:', before - file.circuits.length)

const feedByRef = new Map()
for (const c of file.circuits) {
  if (c.originId === SSB && c.circuitRef && /^SSB-2PWS1160-Q\d+$/i.test(c.circuitRef)) {
    feedByRef.set(c.circuitRef, c)
  }
}

const jbxSheet = parseSheet('worksheets/sheet8.xml')
const sktSheet = parseSheet('worksheets/sheet9.xml')

/** @type {Map<string, {tag:string, desc:string|null, local:string|null, dedicated:boolean, eq1:string|null, eq1desc:string|null, eq2:string|null, eq2desc:string|null}>} */
const socketsByTag = new Map()
for (const [rn, row] of sktSheet) {
  const tag = str(row.B)
  if (!tag || !/^SKT-/i.test(tag)) continue
  // Col. K: "✓" = dedicado, "X" = genérico
  socketsByTag.set(tag, {
    tag,
    rn,
    desc: str(row.C),
    local: str(row.D),
    dedicated: str(row.K) === '✓' || str(row.K) === '√',
    eq1: str(row.M),
    eq1desc: str(row.N),
    eq2: str(row.O),
    eq2desc: str(row.P),
  })
}

/** Filas Junction Boxes del SSB, orden Excel. */
const jbxRows = []
for (const [rn, row] of [...jbxSheet.entries()].sort((a, b) => a[0] - b[0])) {
  const circuit = str(row.L)
  if (!circuit || !circuit.startsWith(`${SSB}-`)) continue
  const desc = str(row.D)
  const tag = resolveTag(row.C, desc)
  jbxRows.push({
    rn,
    tag,
    desc,
    service: str(row.E) || 'NV',
    pnKW: num(row.G),
    circuit,
    cableType: str(row.M),
    parallel: num(row.N) || 1,
    section: row.O != null ? String(row.O) : '2.5',
  })
}

/** Agrupar por alimentacion Qxx */
const byFeeder = new Map()
for (const row of jbxRows) {
  const m = row.circuit.match(/^(SSB-2PWS1160-Q\d+)/i)
  if (!m) continue
  const feeder = m[1]
  if (!byFeeder.has(feeder)) byFeeder.set(feeder, [])
  byFeeder.get(feeder).push(row)
}

let added = 0
let eqDedicated = 0

for (const [feederRef, rows] of byFeeder) {
  const feed = feedByRef.get(feederRef)
  if (!feed) {
    console.warn('No SSB feed circuit for', feederRef)
    continue
  }
  const rootJbx = feed.destinationId
  ensureEq(rootJbx, {
    name: rows[0]?.desc || 'CAJA DE CONEXIÓN (NV)',
    kind: 'consumidor',
    voltage: '230',
    spare: false,
    virtual: false,
  })
  if (feed.cableType == null && rows[0]?.cableType) {
    feed.cableType = rows[0].cableType
  }
  if (!feed.cableSection && rows[0]?.section) {
    feed.cableSection = rows[0].section
  }

  /** circuitRef → equipment id (JBX) */
  const jbxByRef = new Map([[feederRef, rootJbx]])
  const jbxHas10 = rows.some((r) => r.circuit === `${feederRef}-10` && isJbxTag(r.tag, r.desc))

  for (const row of rows) {
    if (row.circuit === feederRef) continue // acometida ya existe
    const suf = row.circuit.slice(feederRef.length + 1)
    if (!suf) continue

    let tag = row.tag
    if (!tag && isJbxTag(null, row.desc)) {
      // nested JBX without tag — skip if unresolvable
      console.warn('JBX without tag', row.rn, row.circuit)
      continue
    }
    if (!tag) {
      console.warn('Row without tag', row.rn, row.circuit, row.desc)
      continue
    }

    const nonSktUnder10 = !isSktTag(tag) && !isJbxTag(tag, row.desc)
    const parentRef = parentCircuitRef(feederRef, suf, {
      jbxHas10,
      nonSktUnder10,
    })
    const originId = jbxByRef.get(parentRef)
    if (!originId) {
      console.warn('Missing parent', parentRef, 'for', row.circuit)
      continue
    }

    const sktMeta = socketsByTag.get(tag)
    const name =
      row.desc ||
      sktMeta?.desc ||
      (isJbxTag(tag, row.desc)
        ? 'CAJA DE CONEXIÓN (NV)'
        : isSktTag(tag)
          ? 'ENCHUFE 230 V'
          : tag)

    ensureEq(tag, {
      name,
      kind: 'consumidor',
      voltage: '230',
      local: sktMeta?.local || undefined,
      spare: false,
      virtual: false,
      description: sktMeta?.dedicated
        ? `Dedicado${sktMeta.eq1 ? `: ${sktMeta.eq1}` : ''}`
        : undefined,
    })

    if (isJbxTag(tag, row.desc)) {
      jbxByRef.set(row.circuit, tag)
    }

    const id = `jbx-1160-${feederRef.replace(/SSB-2PWS1160-/i, '').toLowerCase()}-${suf}`
    const suffixLabel = `${feederRef.replace(/SSB-2PWS1160-/i, '')}-${suf}`
    upsertCircuit({
      id,
      excelRow: row.rn,
      circuitRef: row.circuit,
      name: `${originId} → ${tag}`,
      originId,
      destinationId: tag,
      lineType: 'normal',
      service: row.service || 'NV',
      protectionName: suffixLabel,
      protectionModel: null,
      protectionCurrentA: null,
      pnKW: row.pnKW,
      pKWe: row.pnKW,
      qKVAr: row.pnKW != null ? row.pnKW * 0.75 : null,
      sKVA: row.pnKW != null ? row.pnKW * 1.25 : null,
      ibA:
        row.pnKW != null ? (row.pnKW * 1000) / (230 * 0.8) : null,
      voltage: '230',
      parallelCables: row.parallel,
      cableSection: row.section,
      cableType: row.cableType,
      spare: false,
      virtual: false,
      notes: NOTE,
    })
    added++

    // Equipos dedicados colgando del SKT (Sockets M/N, O/P)
    if (sktMeta?.dedicated) {
      for (const [eqId, eqDesc] of [
        [sktMeta.eq1, sktMeta.eq1desc],
        [sktMeta.eq2, sktMeta.eq2desc],
      ]) {
        if (!eqId) continue
        ensureEq(eqId, {
          name: eqDesc || eqId,
          kind: 'consumidor',
          voltage: '230',
          spare: false,
          virtual: false,
        })
        upsertCircuit({
          id: `jbx-1160-ded-${tag}-${eqId}`.toLowerCase().replace(/[^a-z0-9-]+/gi, '-'),
          excelRow: sktMeta.rn ?? null,
          circuitRef: `${row.circuit}-${eqId}`,
          name: `${tag} → ${eqId}`,
          originId: tag,
          destinationId: eqId,
          lineType: 'normal',
          service: row.service || 'NV',
          protectionName: eqId,
          protectionModel: null,
          protectionCurrentA: null,
          pnKW: null,
          voltage: '230',
          parallelCables: 1,
          cableSection: null,
          spare: false,
          virtual: false,
          notes: NOTE,
        })
        added++
        eqDedicated++
      }
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(file, null, 4) + '\n', 'utf8')
console.log('Feeders:', [...byFeeder.keys()])
console.log('Added/updated chain circuits:', added)
console.log('Dedicated SKT→equipment links:', eqDedicated)
console.log(
  'Sample kids Q01:',
  file.circuits
    .filter((c) => c.originId === 'JBX-2PWS1013')
    .map((c) => c.circuitRef),
)
console.log(
  'Sample kids Q05:',
  file.circuits
    .filter((c) => c.originId === 'JBX-2PWS1023')
    .map((c) => c.circuitRef),
)
console.log(
  'Sample kids Q08 nest:',
  file.circuits
    .filter((c) => c.originId === 'JBX-2PWS1032')
    .map((c) => c.circuitRef),
)
