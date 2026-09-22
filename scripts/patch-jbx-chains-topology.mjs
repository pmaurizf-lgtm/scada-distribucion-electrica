/**
 * Incorpora cadenas JBX→SKT/carga (notes: jbx-chain) de Rev.D en una topología
 * parseada (p. ej. Rev.C). El Excel de lista de circuitos solo deja JBX como hoja;
 * el desarrollo aguas abajo vive en abtDownstream (import-jbx-all-chains).
 *
 * Uso: node scripts/patch-jbx-chains-topology.mjs [ruta-rev-c.json] [ruta-rev-d.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_C = path.join(__dirname, '../src/data/topologyRevC.json')
const DEFAULT_D = path.join(__dirname, '../src/data/abtDownstream.json')
const OUT = path.resolve(process.argv[2] ?? DEFAULT_C)
const SRC_D = path.resolve(process.argv[3] ?? DEFAULT_D)

const NOTE_RE = /^jbx-chain/

const fileC = JSON.parse(fs.readFileSync(OUT, 'utf8'))
const fileD = JSON.parse(fs.readFileSync(SRC_D, 'utf8'))

if (!Array.isArray(fileC.circuits) || !Array.isArray(fileC.equipment)) {
  console.error('JSON destino sin circuits/equipment:', OUT)
  process.exit(1)
}
if (!Array.isArray(fileD.circuits) || !Array.isArray(fileD.equipment)) {
  console.error('JSON fuente sin circuits/equipment:', SRC_D)
  process.exit(1)
}

/** @type {Map<string, object>} */
const eqD = new Map(fileD.equipment.map((e) => [e.id, e]))
/** @type {Map<string, object>} */
const eqC = new Map(fileC.equipment.map((e) => [e.id, e]))
const circIdsC = new Set(fileC.circuits.map((c) => c.id))
/** clave origen|destino|protección para no duplicar aunque cambie el id */
const circKeyC = new Set(
  fileC.circuits.map(
    (c) =>
      `${c.originId}|${c.destinationId}|${c.protectionName ?? ''}|${c.circuitRef ?? ''}`,
  ),
)

const chainCircs = fileD.circuits.filter((c) =>
  NOTE_RE.test(String(c.notes ?? '')),
)

/** @type {Map<string, object[]>} */
const byOrigin = new Map()
for (const circ of chainCircs) {
  const list = byOrigin.get(circ.originId) ?? []
  list.push(circ)
  byOrigin.set(circ.originId, list)
}

let addedCirc = 0
let addedEq = 0
let kindFixed = 0

const queue = [...eqC.keys()]
const visited = new Set()

while (queue.length > 0) {
  const originId = queue.shift()
  if (!originId || visited.has(originId)) continue
  visited.add(originId)

  for (const circ of byOrigin.get(originId) ?? []) {
    const key = `${circ.originId}|${circ.destinationId}|${circ.protectionName ?? ''}|${circ.circuitRef ?? ''}`
    if (circIdsC.has(circ.id) || circKeyC.has(key)) continue

    const destId = circ.destinationId
    if (destId && !eqC.has(destId)) {
      const srcEq = eqD.get(destId)
      if (srcEq) {
        const copy = { ...srcEq }
        fileC.equipment.push(copy)
        eqC.set(destId, copy)
        addedEq++
        queue.push(destId)
      }
    }

    const copyCirc = { ...circ }
    fileC.circuits.push(copyCirc)
    circIdsC.add(copyCirc.id)
    circKeyC.add(key)
    addedCirc++
  }
}

// Alinear kind de JBX/SKT ya presentes (Rev.C los marca a veces como cuadro).
for (const e of fileC.equipment) {
  if (!/^JBX-|^SKT-/i.test(e.id)) continue
  if (e.kind === 'consumidor') continue
  const kids = byOrigin.get(e.id)?.length ?? 0
  const hasKidsInC = fileC.circuits.some((c) => c.originId === e.id)
  if (kids > 0 || hasKidsInC || /^JBX-|^SKT-/i.test(e.id)) {
    e.kind = 'consumidor'
    kindFixed++
  }
}

fs.writeFileSync(OUT, `${JSON.stringify(fileC)}\n`)

const sampleIds = ['JBX-2PWS1004', 'JBX-2PWS1006', 'JBX-RADS1001']
const sample = sampleIds.map((id) => ({
  id,
  inC: eqC.has(id),
  kids: fileC.circuits.filter((c) => c.originId === id).length,
}))

console.log('Patched', OUT)
console.log({
  chainInD: chainCircs.length,
  addedCirc,
  addedEq,
  kindFixed,
  equipment: fileC.equipment.length,
  circuits: fileC.circuits.length,
  sample,
})
