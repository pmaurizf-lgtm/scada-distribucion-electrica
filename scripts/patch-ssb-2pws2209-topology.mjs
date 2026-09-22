/**
 * Aplica el layout multi-barra SSB-2PWS2209 (como Rev.D) a un DistributionData JSON.
 *
 *   NORM → QN → SALIDAS 1
 *   ALT  → QA → Q0T-II ─┐
 *   SALIDAS 1 → Q0T-I ──┴→ SALIDAS 2
 *   SALIDAS 1 → Q03 → barra Q03 → Q03.01…09  (Excel Q02…Q10)
 *   SALIDAS 2 → Q01 → UPS → Q02 ─┐
 *   SALIDAS 2 → Q05 ─────────────┴→ SALIDAS 3 → Q05.1…15  (Excel Q12…Q26)
 *   SALIDAS 2 → Q04  (Excel Q11)
 *
 * Uso:
 *   node scripts/patch-ssb-2pws2209-topology.mjs [ruta.json]
 * Por defecto: src/data/topologyRevC.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = path.join(__dirname, '../src/data/topologyRevC.json')
const OUT = path.resolve(process.argv[2] ?? DEFAULT_OUT)

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
if (!Array.isArray(file.equipment) || !Array.isArray(file.circuits)) {
  console.error('JSON sin equipment/circuits:', OUT)
  process.exit(1)
}

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

ensureEq(S1, {
  name: 'SALIDAS 1 (Sin conmutador)',
  kind: 'cuadro_secundario',
  voltage: '230 V',
  virtual: true,
  dcp10Id: S1,
})
ensureEq(S2, {
  name: 'SALIDAS 2 (Con conmutador, sin UPS)',
  kind: 'cuadro_secundario',
  voltage: '230 V',
  virtual: true,
  dcp10Id: S2,
})
ensureEq(S3, {
  name: 'SALIDAS 3 (Con conmutador y UPS)',
  kind: 'cuadro_secundario',
  voltage: '230 V',
  virtual: true,
  dcp10Id: S3,
})
ensureEq(BUS_Q03, {
  name: 'Barra Q03 (SALIDAS 1)',
  kind: 'cuadro_secundario',
  voltage: '230 V',
  virtual: true,
  dcp10Id: BUS_Q03,
})
ensureEq(BUS_QA, {
  name: 'Tras QA (ALT)',
  kind: 'cuadro_secundario',
  voltage: '230 V',
  virtual: true,
  dcp10Id: BUS_QA,
})
ensureEq(UPS, {
  name: 'UPS interna SSB-2PWS2209',
  kind: 'conversion',
  voltage: '230 V',
  local: file.equipment.find((e) => e.id === SSB)?.local ?? null,
  dcp10Id: UPS,
})

removeCircuits(
  (c) =>
    c.originId === SSB &&
    (c.notes === 'ssb-incoming' ||
      c.notes === NOTE_QA ||
      c.destinationId === BUS_OLD ||
      c.destinationId === S1 ||
      c.destinationId === BUS_QA),
)
file.equipment = file.equipment.filter((e) => e.id !== BUS_OLD)

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

const removedFlat = removeCircuits((c) => excelOutlets.includes(c))
// Quitar restos internos previos del patch (re-ejecutable)
removeCircuits(
  (c) =>
    c.notes === NOTE_INT ||
    c.notes === NOTE_TIE ||
    c.notes === NOTE_QA ||
    (c.originId === SSB && (c.protectionName === 'QN' || c.protectionName === 'QA')),
)

upsertCircuit({
  id: 'revc-patch-2209-qn',
  name: `${SSB} → ${S1}`,
  originId: SSB,
  destinationId: S1,
  circuitRef: `${SSB}-QN`,
  protectionName: 'QN',
  protectionModel: 'INS 80',
  lineType: 'normal',
  voltage: '230 V',
  notes: NOTE_QN,
  service: 'VS',
})

upsertCircuit({
  id: 'revc-patch-2209-qa',
  name: `${SSB} → ${BUS_QA}`,
  originId: SSB,
  destinationId: BUS_QA,
  circuitRef: `${SSB}-QA`,
  protectionName: 'QA',
  protectionModel: 'INS 80',
  lineType: 'alternativa',
  voltage: '230 V',
  notes: NOTE_QA,
  service: 'VS',
})

upsertCircuit({
  id: 'revc-patch-2209-q0t-ii',
  name: `${BUS_QA} → ${S2}`,
  originId: BUS_QA,
  destinationId: S2,
  circuitRef: `${SSB}-Q0T-II`,
  protectionName: 'Q0T-II',
  protectionModel: 'NSX 100B M2.2',
  lineType: 'alternativa',
  voltage: '230 V',
  notes: NOTE_TIE,
  service: 'VS',
})

upsertCircuit({
  id: 'revc-patch-2209-q0t-i',
  name: `${S1} → ${S2}`,
  originId: S1,
  destinationId: S2,
  circuitRef: `${SSB}-Q0T-I`,
  protectionName: 'Q0T-I',
  protectionModel: 'NSX 100B M2.2',
  lineType: 'normal',
  voltage: '230 V',
  notes: NOTE_TIE,
  service: 'VS',
})

{
  const src = byProt.get('Q01')
  upsertCircuit({
    id: src?.id ?? 'revc-patch-2209-q03',
    excelRow: src?.excelRow ?? null,
    name: `${S1} → ${BUS_Q03}`,
    originId: S1,
    destinationId: BUS_Q03,
    circuitRef: `${SSB}-Q03`,
    protectionName: 'Q03',
    protectionModel: src?.protectionModel ?? 'iC60 N - 32D',
    protectionCurrentA: src?.protectionCurrentA ?? null,
    lineType: 'normal',
    voltage: '230 V',
    cableSection: src?.cableSection ?? null,
    notes: NOTE_INT,
    service: 'VS',
  })
}

for (let i = 2; i <= 10; i++) {
  const src = byProt.get(`Q${String(i).padStart(2, '0')}`)
  if (!src) continue
  const n = i - 1
  const label = `Q03.0${n}`
  // SPARE Q03/Q04 del Excel plano: destinos bajo barra Q03
  upsertCircuit({
    ...src,
    originId: BUS_Q03,
    protectionName: label,
    circuitRef: `${SSB}-${label}`,
    name: `${BUS_Q03} → ${src.destinationId}`,
    notes: NOTE_INT,
    voltage: src.voltage ?? '230 V',
  })
}

upsertCircuit({
  id: 'revc-patch-2209-q01-ups',
  name: `${S2} → ${UPS}`,
  originId: S2,
  destinationId: UPS,
  circuitRef: `${SSB}-Q01`,
  protectionName: 'Q01',
  protectionModel: IC60,
  lineType: 'normal',
  voltage: '230 V',
  cableSection: CABLE,
  notes: NOTE_INT,
  service: 'VS',
})

upsertCircuit({
  id: 'revc-patch-2209-q02',
  name: `${UPS} → ${S3}`,
  originId: UPS,
  destinationId: S3,
  circuitRef: `${SSB}-Q02`,
  protectionName: 'Q02',
  protectionModel: IC60,
  lineType: 'normal',
  voltage: '230 V',
  cableSection: CABLE,
  notes: NOTE_INT,
  service: 'VS',
})

upsertCircuit({
  id: 'revc-patch-2209-q05',
  name: `${S2} → ${S3}`,
  originId: S2,
  destinationId: S3,
  circuitRef: `${SSB}-Q05`,
  protectionName: 'Q05',
  protectionModel: IC60,
  lineType: 'alternativa',
  voltage: '230 V',
  cableSection: CABLE,
  notes: NOTE_INT,
  service: 'VS',
})

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
      voltage: src.voltage ?? '230 V',
    })
  }
}

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
    voltage: src.voltage ?? '230 V',
  })
}

const ssbEq = file.equipment.find((e) => e.id === SSB)
if (ssbEq) {
  ssbEq.incomingSwitch = 'INS 80'
  if (!ssbEq.voltage) ssbEq.voltage = '230 V'
}

fs.writeFileSync(OUT, `${JSON.stringify(file)}\n`)

const related = file.circuits.filter(
  (c) =>
    c.originId === SSB ||
    c.originId.startsWith(`BUS-${SSB}`) ||
    c.originId === UPS ||
    c.destinationId?.startsWith?.(`BUS-${SSB}`) ||
    c.destinationId === UPS,
)

console.log('Patched', OUT)
console.log({
  removedFlat,
  excelOutlets: excelOutlets.length,
  relatedCircuits: related.length,
  qn: related.some((c) => c.protectionName === 'QN'),
  fromQ03: related.filter((c) => c.originId === BUS_Q03).length,
  fromS3: related.filter((c) => c.originId === S3).length,
})
