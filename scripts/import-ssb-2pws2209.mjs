/**
 * Patch one-shot: topología especial SSB-2PWS2209 (navegación 230 V).
 *
 *   NORM → QN (INS 80) → SALIDAS 1
 *   ALT  → QA (INS 80) → Q0T-II ─┐
 *   SALIDAS 1 → Q0T-I ───────────┴→ SALIDAS 2
 *   SALIDAS 1 → Q03 → barra Q03 → Q03.01…09  (Excel Q01…Q10)
 *   SALIDAS 2 → Q01 → UPS → Q02 ─┐
 *   SALIDAS 2 → Q05 ─────────────┴→ SALIDAS 3 → Q05.1…15  (Excel Q12…Q26)
 *   SALIDAS 2 → Q04  (Excel Q11)
 *
 * Uso: node scripts/import-ssb-2pws2209.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../src/data/abtDownstream.json')

const SSB = 'SSB-2PWS2209'
const BUS_OLD = `BUS-${SSB}`
const S1 = `BUS-${SSB}-S1`
const S2 = `BUS-${SSB}-S2`
const S3 = `BUS-${SSB}-S3`
const BUS_Q03 = `BUS-${SSB}-Q03`
const BUS_QA = `BUS-${SSB}-QA`
const UPS = `UPS-${SSB}`

const NOTE_QN = 'ssb-incoming'
const NOTE_QA = 'ssb-2209-qa'
const NOTE_TIE = 'ssb-2209-tie'
const NOTE_INT = 'ssb-2209-internal'

const IC60 = 'iC60N 2x10 D'
const CABLE = '2x2,5'

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

function removeCircuits(pred) {
  const before = file.circuits.length
  file.circuits = file.circuits.filter((c) => !pred(c))
  return before - file.circuits.length
}

function upsertCircuit(c) {
  const i = file.circuits.findIndex((x) => x.id === c.id)
  if (i >= 0) file.circuits[i] = { ...file.circuits[i], ...c }
  else file.circuits.push(c)
}

// --- Equipos barra / UPS ---
ensureEq(S1, {
  name: 'SALIDAS 1 (Sin conmutador)',
  kind: 'cuadro_secundario',
  voltage: '230',
  virtual: true,
})
ensureEq(S2, {
  name: 'SALIDAS 2 (Con conmutador, sin UPS)',
  kind: 'cuadro_secundario',
  voltage: '230',
  virtual: true,
})
ensureEq(S3, {
  name: 'SALIDAS 3 (Con conmutador y UPS)',
  kind: 'cuadro_secundario',
  voltage: '230',
  virtual: true,
})
ensureEq(BUS_Q03, {
  name: 'Barra Q03 (SALIDAS 1)',
  kind: 'cuadro_secundario',
  voltage: '230',
  virtual: true,
})
ensureEq(BUS_QA, {
  name: 'Tras QA (ALT)',
  kind: 'cuadro_secundario',
  voltage: '230',
  virtual: true,
})
ensureEq(UPS, {
  name: 'UPS interna SSB-2PWS2209',
  kind: 'conversion',
  voltage: '230',
  local: file.equipment.find((e) => e.id === SSB)?.local ?? null,
})

// Quitar barra antigua y duplicados INS
removeCircuits(
  (c) =>
    c.originId === SSB &&
    (c.notes === 'ssb-incoming' || c.destinationId === BUS_OLD),
)
file.equipment = file.equipment.filter((e) => e.id !== BUS_OLD)

// Self-loop Excel Q01 y salidas planas Q01–Q26 desde el SSB (se reparentan)
const excelOutlets = file.circuits.filter(
  (c) =>
    c.originId === SSB &&
    !c.virtual &&
    c.notes !== NOTE_QN &&
    c.notes !== NOTE_QA &&
    /^Q\d+/i.test(String(c.protectionName ?? '')),
)

/** @type {Map<string, object>} */
const byProt = new Map()
for (const c of excelOutlets) {
  const p = String(c.protectionName)
  if (!byProt.has(p)) byProt.set(p, c)
}

removeCircuits((c) => excelOutlets.includes(c))

// --- Cadena de sección ---
upsertCircuit({
  id: 'abt-patch-2209-qn',
  name: `${SSB} → ${S1}`,
  originId: SSB,
  destinationId: S1,
  circuitRef: `${SSB}-QN`,
  protectionName: 'QN',
  protectionModel: 'INS 80',
  lineType: 'normal',
  voltage: '230',
  notes: NOTE_QN,
  service: 'VS',
})

upsertCircuit({
  id: 'abt-patch-2209-qa',
  name: `${SSB} → ${BUS_QA}`,
  originId: SSB,
  destinationId: BUS_QA,
  circuitRef: `${SSB}-QA`,
  protectionName: 'QA',
  protectionModel: 'INS 80',
  lineType: 'alternativa',
  voltage: '230',
  notes: NOTE_QA,
  service: 'VS',
})

upsertCircuit({
  id: 'abt-patch-2209-q0t-ii',
  name: `${BUS_QA} → ${S2}`,
  originId: BUS_QA,
  destinationId: S2,
  circuitRef: `${SSB}-Q0T-II`,
  protectionName: 'Q0T-II',
  protectionModel: 'NSX 100B M2.2',
  lineType: 'alternativa',
  voltage: '230',
  notes: NOTE_TIE,
  service: 'VS',
})

upsertCircuit({
  id: 'abt-patch-2209-q0t-i',
  name: `${S1} → ${S2}`,
  originId: S1,
  destinationId: S2,
  circuitRef: `${SSB}-Q0T-I`,
  protectionName: 'Q0T-I',
  protectionModel: 'NSX 100B M2.2',
  lineType: 'normal',
  voltage: '230',
  notes: NOTE_TIE,
  service: 'VS',
})

// Q03 (Excel Q01) → barra Q03
{
  const src = byProt.get('Q01')
  upsertCircuit({
    id: src?.id ?? 'abt-patch-2209-q03',
    excelRow: src?.excelRow ?? 573,
    name: `${S1} → ${BUS_Q03}`,
    originId: S1,
    destinationId: BUS_Q03,
    circuitRef: `${SSB}-Q03`,
    protectionName: 'Q03',
    protectionModel: src?.protectionModel ?? 'iC60 N - 32D',
    protectionCurrentA: src?.protectionCurrentA ?? null,
    lineType: 'normal',
    voltage: '230',
    cableSection: src?.cableSection ?? null,
    notes: NOTE_INT,
    service: 'VS',
  })
}

// Q03.01–Q03.09 (Excel Q02–Q10)
for (let i = 2; i <= 10; i++) {
  const src = byProt.get(`Q${String(i).padStart(2, '0')}`)
  if (!src) continue
  const n = i - 1
  const label = `Q03.0${n}`
  upsertCircuit({
    ...src,
    originId: BUS_Q03,
    protectionName: label,
    circuitRef: `${SSB}-${label}`,
    name: `${BUS_Q03} → ${src.destinationId}`,
    notes: NOTE_INT,
    voltage: '230',
  })
}

// SALIDAS 2 → UPS (Q01 sintético) y Q05 sintético → S3; Q02 tras UPS
upsertCircuit({
  id: 'abt-patch-2209-q01-ups',
  name: `${S2} → ${UPS}`,
  originId: S2,
  destinationId: UPS,
  circuitRef: `${SSB}-Q01`,
  protectionName: 'Q01',
  protectionModel: IC60,
  lineType: 'normal',
  voltage: '230',
  cableSection: CABLE,
  notes: NOTE_INT,
  service: 'VS',
})

upsertCircuit({
  id: 'abt-patch-2209-q02',
  name: `${UPS} → ${S3}`,
  originId: UPS,
  destinationId: S3,
  circuitRef: `${SSB}-Q02`,
  protectionName: 'Q02',
  protectionModel: IC60,
  lineType: 'normal',
  voltage: '230',
  cableSection: CABLE,
  notes: NOTE_INT,
  service: 'VS',
})

upsertCircuit({
  id: 'abt-patch-2209-q05',
  name: `${S2} → ${S3}`,
  originId: S2,
  destinationId: S3,
  circuitRef: `${SSB}-Q05`,
  protectionName: 'Q05',
  protectionModel: IC60,
  lineType: 'alternativa',
  voltage: '230',
  cableSection: CABLE,
  notes: NOTE_INT,
  service: 'VS',
})

// Q04 (Excel Q11) desde S2
{
  const src = byProt.get('Q11')
  if (src) {
    upsertCircuit({
      ...src,
      originId: S2,
      protectionName: 'Q04',
      circuitRef: `${SSB}-Q04`,
      name: `${S2} → ${src.destinationId}`,
      notes: NOTE_INT,
      voltage: '230',
    })
  }
}

// Q05.1–Q05.15 (Excel Q12–Q26) desde S3
for (let i = 12; i <= 26; i++) {
  const src = byProt.get(`Q${i}`)
  if (!src) continue
  const n = i - 11
  const label = `Q05.${n}`
  upsertCircuit({
    ...src,
    originId: S3,
    protectionName: label,
    circuitRef: `${SSB}-${label}`,
    name: `${S3} → ${src.destinationId}`,
    notes: NOTE_INT,
    voltage: '230',
  })
}

// Marcar cuadro
const ssbEq = file.equipment.find((e) => e.id === SSB)
if (ssbEq) {
  ssbEq.incomingSwitch = 'INS 80'
  ssbEq.voltage = '230'
}

file._comment = String(file._comment ?? '')
if (!file._comment.includes('SSB-2PWS2209 multi-barra')) {
  file._comment +=
    ' | SSB-2PWS2209 multi-barra (S1/S2/S3, QN/QA, Q0T, UPS) patch'
}

fs.writeFileSync(OUT, JSON.stringify(file))
console.log('Patched', OUT)
console.log('Barras', S1, S2, S3, BUS_Q03, BUS_QA, UPS)
console.log(
  'Circuitos 2209 internos',
  file.circuits.filter(
    (c) =>
      c.originId === SSB ||
      c.originId.startsWith(`BUS-${SSB}`) ||
      c.originId === UPS ||
      c.destinationId.startsWith(`BUS-${SSB}`) ||
      c.destinationId === UPS,
  ).length,
)
