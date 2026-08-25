/**
 * Patch SSB-2PWS4531 (Excel fila 2864):
 *   INS 160 → barra → Q01 → 6 bases enchufe trifásicas III+T IEC 60309
 *
 * Uso: node scripts/import-ssb-2pws4531.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../src/data/abtDownstream.json')

const SSB = 'SSB-2PWS4531'
const SKT_BUS = `BUS-${SSB}-SKT`
const SPARE = `SPARE-${SSB}-`
const NOTE_SOCKET = 'ssb4531-socket'

const SOCKET_NAME = 'BASE ENCHUFE TRIFÁSICA 230V 32A III+T IEC 60309'
const IC60 = 'iC60 N - 32D'

const file = JSON.parse(fs.readFileSync(OUT, 'utf8'))

function ensureEq(id, patch) {
  let eq = file.equipment.find((e) => e.id === id)
  if (!eq) {
    eq = { id, ...patch }
    file.equipment.push(eq)
  } else Object.assign(eq, patch)
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

// Quitar placeholder Excel fila 2864 (RESPETO agregado)
const aggregateSrc = file.circuits.find(
  (c) => c.originId === SSB && c.excelRow === 2864,
)
const aggregate = {
  pnKW: aggregateSrc?.pnKW ?? 30.594945,
  qKVAr: aggregateSrc?.qKVAr ?? 22.946209,
  sKVA: aggregateSrc?.sKVA ?? 38.243682,
  ibA: aggregateSrc?.ibA ?? 96,
  protectionCurrentA: aggregateSrc?.protectionCurrentA ?? 32,
}

file.equipment = file.equipment.filter((e) => e.id !== SPARE)
const removed = removeCircuits(
  (c) =>
    c.originId === SSB &&
    (c.destinationId === SPARE || c.excelRow === 2864),
)
console.log('Removed spare / row 2864 circuits:', removed)

ensureEq(SKT_BUS, {
  name: 'Barra enchufes SSB-2PWS4531',
  kind: 'cuadro_secundario',
  voltage: '230',
  virtual: true,
})

upsertCircuit({
  id: 'abt-230-2338',
  excelRow: 2864,
  circuitRef: `${SSB}-Q01`,
  name: `${SSB} → ${SKT_BUS}`,
  originId: SSB,
  destinationId: SKT_BUS,
  lineType: 'normal',
  service: 'VM',
  protectionName: 'Q01',
  protectionModel: IC60,
  protectionCurrentA: aggregate.protectionCurrentA ?? 32,
  pnKW: aggregate.pnKW,
  pKWe: null,
  qKVAr: aggregate.qKVAr,
  sKVA: aggregate.sKVA,
  ibA: aggregate.ibA,
  voltage: '230',
  parallelCables: 1,
  cableSection: '10',
  spare: false,
  virtual: false,
})

const perSocket = {
  pnKW: aggregate.pnKW != null ? aggregate.pnKW / 6 : null,
  ibA: aggregate.ibA != null ? aggregate.ibA / 6 : null,
  sKVA: aggregate.sKVA != null ? aggregate.sKVA / 6 : null,
  qKVAr: aggregate.qKVAr != null ? aggregate.qKVAr / 6 : null,
}

for (let n = 1; n <= 6; n++) {
  const sktId = `SKT-2PWS4531-${String(n).padStart(2, '0')}`
  const cId = `abt-230-4531-skt-${String(n).padStart(2, '0')}`
  ensureEq(sktId, {
    name: `${SOCKET_NAME} (${n})`,
    kind: 'consumidor',
    voltage: '230',
    local: '1-72-1-Q',
    localName: 'ESPACIO MULTIMISION',
    spare: false,
    virtual: false,
  })
  upsertCircuit({
    id: cId,
    excelRow: 2864,
    circuitRef: `${SSB}-Q01-${String(n).padStart(2, '0')}`,
    name: `${SKT_BUS} → ${sktId}`,
    originId: SKT_BUS,
    destinationId: sktId,
    lineType: 'normal',
    service: 'VM',
    protectionName: '—',
    protectionModel: null,
    protectionCurrentA: null,
    pnKW: perSocket.pnKW,
    pKWe: perSocket.pnKW,
    qKVAr: perSocket.qKVAr,
    sKVA: perSocket.sKVA,
    ibA: perSocket.ibA,
    voltage: '230',
    parallelCables: 1,
    cableSection: '2.5',
    spare: false,
    virtual: true,
    notes: NOTE_SOCKET,
  })
}

fs.writeFileSync(OUT, JSON.stringify(file, null, 4) + '\n', 'utf8')
console.log('Patched SSB-2PWS4531: Q01 + 6 sockets →', OUT)
