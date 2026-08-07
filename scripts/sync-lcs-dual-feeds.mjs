/**
 * Sincroniza dobles alimentaciones (col. M: Normal / Alternative) de salidas LCS
 * en 440V y 230V Power System.
 *
 * - Si el par NORM+ALT está en LCS ya integrados → lineType correcto.
 * - Si falta el remoto (otro LCS no integrado u origen externo) → ORIGEN-PENDIENTE.
 */
import { readFileSync, writeFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'

const INTEGRATED = new Set([
  'LCS-4PWS0001',
  'LCS-4PWS0002',
  'LCS-4PWS0003',
  'LCS-4PWS0004',
  'LCS-4PWS0005',
  'LCS-4PWS0006',
])

const PENDING_ORIGIN = 'ORIGEN-PENDIENTE'

const ssXml = readFileSync(`${base}/sharedStrings.xml`, 'utf8')
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

function collectDual(sheetPath, voltage) {
  const rows = parseSheet(sheetPath)
  const list = []
  for (const [rn, row] of rows) {
    const m = String(row.M || '')
    if (m !== 'Normal' && m !== 'Alternative') continue
    const origin = String(row.E || '')
    if (!origin.startsWith('LCS-')) continue
    const dest = String(row.I || '')
    if (!dest || dest === 'NaN' || /^\d+$/.test(dest)) continue
    list.push({
      rn,
      voltage,
      lineType: m === 'Alternative' ? 'alternativa' : 'normal',
      origin,
      dest,
      circuitRef: String(row.D || ''),
      service: String(row.N || '') || null,
      desc: String(row.L || ''),
    })
  }
  return list
}

const duals = [
  ...collectDual(`${base}/worksheets/sheet2.xml`, '440'),
  ...collectDual(`${base}/worksheets/sheet3.xml`, '230'),
]

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))

function findCircuit(ref, origin, dest) {
  return (
    data.circuits.find((c) => c.circuitRef === ref) ||
    data.circuits.find(
      (c) =>
        !c.virtual &&
        c.originId === origin &&
        c.destinationId === dest &&
        !c.spare,
    )
  )
}

function ensurePendingEquipment() {
  if (data.equipment.some((e) => e.id === PENDING_ORIGIN)) return
  data.equipment.push({
    id: PENDING_ORIGIN,
    name: 'Origen pendiente de identificar',
    kind: 'cuadro_secundario',
    voltage: null,
    spare: false,
    virtual: false,
  })
}

function pendingId(dest, lineType) {
  const tag = lineType === 'alternativa' ? 'alt' : 'norm'
  return `abt-pend-${dest.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${tag}`
}

function ensurePendingCircuit(dest, lineType, service, voltage, knownRef) {
  ensurePendingEquipment()
  const id = pendingId(dest, lineType)
  const existing = data.circuits.find((c) => c.id === id)
  if (existing) return existing
  const circ = {
    id,
    excelRow: null,
    circuitRef: null,
    name: `PENDIENTE → ${dest} (${lineType === 'alternativa' ? 'ALT' : 'NORM'})`,
    originId: PENDING_ORIGIN,
    destinationId: dest,
    lineType,
    service,
    protectionName: 'PEND',
    protectionModel: null,
    protectionCurrentA: null,
    pnKW: null,
    voltage,
    parallelCables: null,
    cableSection: null,
    spare: false,
    virtual: false,
    notes: `Alimentación ${lineType} pendiente (par conocido: ${knownRef})`,
  }
  data.circuits.push(circ)
  return circ
}

/** Agrupar por destino */
const byDest = new Map()
for (const d of duals) {
  if (!byDest.has(d.dest)) byDest.set(d.dest, [])
  byDest.get(d.dest).push(d)
}

const report = { set: [], pending: [], skip: [] }

for (const [dest, list] of byDest) {
  const norms = list.filter((x) => x.lineType === 'normal')
  const alts = list.filter((x) => x.lineType === 'alternativa')

  // Aplicar lineType a circuitos LCS integrados presentes en datos
  for (const d of list) {
    if (!INTEGRATED.has(d.origin)) continue
    const circ = findCircuit(d.circuitRef, d.origin, d.dest)
    if (!circ) {
      report.skip.push(`missing circuit ${d.circuitRef}`)
      continue
    }
    if (circ.lineType !== d.lineType) {
      circ.lineType = d.lineType
      circ.notes = `Col. M Excel: ${d.lineType === 'alternativa' ? 'Alternative' : 'Normal'}`
      report.set.push(`${circ.circuitRef} → ${d.lineType}`)
    } else if (
      !circ.notes ||
      !/Col\. M|Resuelve|resolvía|Alimentación/.test(circ.notes)
    ) {
      circ.notes = `Col. M Excel: ${d.lineType === 'alternativa' ? 'Alternative' : 'Normal'}`
    }
  }

  // Pares incompletos: falta NORM o ALT en LCS integrados
  const integratedNorms = norms.filter((x) => INTEGRATED.has(x.origin))
  const integratedAlts = alts.filter((x) => INTEGRATED.has(x.origin))
  const externalNorms = norms.filter((x) => !INTEGRATED.has(x.origin))
  const externalAlts = alts.filter((x) => !INTEGRATED.has(x.origin))

  // Si hay ALT integrado sin NORM integrado → pendiente NORM (salvo que ya exista otra NORM real)
  const existingFeeds = data.circuits.filter(
    (c) =>
      !c.virtual &&
      !c.spare &&
      c.destinationId === dest &&
      c.originId !== PENDING_ORIGIN,
  )
  const hasRealNorm = existingFeeds.some((c) => c.lineType === 'normal')
  const hasRealAlt = existingFeeds.some((c) => c.lineType === 'alternativa')

  if (integratedAlts.length && !hasRealNorm) {
    const known = integratedAlts[0]
    ensurePendingCircuit(
      dest,
      'normal',
      known.service,
      known.voltage,
      known.circuitRef,
    )
    report.pending.push(`${dest} NORM (conocido ALT ${known.circuitRef}; externo ${externalNorms.map((x) => x.origin).join(',') || '—'})`)
  }
  if (integratedNorms.length && !hasRealAlt) {
    // Solo pendiente ALT si Excel indica Alternative en origen no integrado
    // o si hay Alternate marcado pero no hay circuito ALT real.
    // Caso especial: dos NORM desde LCS (p.ej. PSP) sin ALT LCS → no inventar ALT entre ellos.
    const needsAltPending =
      externalAlts.length > 0 ||
      (alts.length === 0 && integratedNorms.length === 1)
    // Si Excel tiene ALT en LCS no integrado:
    if (externalAlts.length > 0 || (alts.length && !integratedAlts.length)) {
      const known = integratedNorms[0]
      ensurePendingCircuit(
        dest,
        'alternativa',
        known.service,
        known.voltage,
        known.circuitRef,
      )
      report.pending.push(
        `${dest} ALT (conocido NORM ${known.circuitRef}; externo ${externalAlts.map((x) => x.origin).join(',') || alts.map((x) => x.origin).join(',')})`,
      )
    } else if (!hasRealAlt && integratedNorms.length === 1 && alts.length === 0) {
      // Un solo Normal en Excel sin Alternative listado bajo LCS — no crear pendiente
    }
  }

  // Destino con ALT integrado + NORM externo (LCS no integrado)
  if (integratedAlts.length && externalNorms.length && !hasRealNorm) {
    // already handled above
  }
  if (integratedNorms.length && externalAlts.length && !hasRealAlt) {
    // already handled
  }
}

// Limpiar pendientes huérfanos (destino ya tiene NORM y ALT reales)
data.circuits = data.circuits.filter((c) => {
  if (c.originId !== PENDING_ORIGIN) return true
  const siblings = data.circuits.filter(
    (x) =>
      !x.virtual &&
      !x.spare &&
      x.destinationId === c.destinationId &&
      x.originId !== PENDING_ORIGIN,
  )
  const hasNorm = siblings.some((x) => x.lineType === 'normal')
  const hasAlt = siblings.some((x) => x.lineType === 'alternativa')
  if (c.lineType === 'normal' && hasNorm) {
    report.skip.push(`drop pending NORM ${c.destinationId}`)
    return false
  }
  if (c.lineType === 'alternativa' && hasAlt) {
    report.skip.push(`drop pending ALT ${c.destinationId}`)
    return false
  }
  return true
})

if (!data.circuits.some((c) => c.originId === PENDING_ORIGIN)) {
  data.equipment = data.equipment.filter((e) => e.id !== PENDING_ORIGIN)
}

writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
console.log('SET', report.set)
console.log('PENDING', report.pending)
console.log('SKIP', report.skip)

// Resumen final por destinos duales
console.log('\n=== Resultado ===')
for (const dest of byDest.keys()) {
  const feeds = data.circuits.filter(
    (c) => !c.virtual && !c.spare && c.destinationId === dest,
  )
  console.log(
    dest,
    feeds.map((c) => `${c.originId}/${c.protectionName}/${c.lineType}`),
  )
}
