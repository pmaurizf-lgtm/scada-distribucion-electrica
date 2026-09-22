/**
 * Acopladores de sección LCS (QVM/QNV) en topología parseada (p. ej. Rev.C):
 * Excel suele marcarlos como SPARE con nombre QVM_440 / QNV_230; el unifilar
 * espera QVM-440 → BUS-LCS-*-{440|230}-{VM|NV} (como Rev.D).
 *
 * Uso: node scripts/patch-lcs-section-ties-topology.mjs [ruta.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = path.join(__dirname, '../src/data/topologyRevC.json')
const OUT = path.resolve(process.argv[2] ?? DEFAULT_OUT)

const TIE_NOTE = 'Acoplador de sección LCS'
const TIE_RE = /^Q(VM|NV)[_-]/i

const file = JSON.parse(fs.readFileSync(OUT, 'utf8'))
if (!Array.isArray(file.circuits) || !Array.isArray(file.equipment)) {
  console.error('JSON sin circuits/equipment:', OUT)
  process.exit(1)
}

/** @type {Map<string, object>} */
const eqById = new Map(file.equipment.map((e) => [e.id, e]))

function ensureBus(lcsId, voltage, svc) {
  const id = `BUS-${lcsId}-${voltage}-${svc}`
  if (!eqById.has(id)) {
    const bus = {
      id,
      name: `Barra ${voltage} V · ${svc}`,
      kind: 'cuadro_secundario',
      voltage: String(voltage),
      virtual: true,
      spare: false,
    }
    file.equipment.push(bus)
    eqById.set(id, bus)
  }
  return id
}

let fixed = 0
/** @type {Set<string>} */
const droppedSpareIds = new Set()

for (const c of file.circuits) {
  if (!/^LCS-/i.test(String(c.originId ?? ''))) continue
  const prot = String(c.protectionName ?? '')
  const m = prot.match(/^Q(VM|NV)[_-](\d+)/i)
  if (!m && !TIE_RE.test(prot)) continue
  if (!m) continue

  const svc = m[1].toUpperCase()
  const voltage = String(c.voltage ?? m[2]).replace(/\s*V$/i, '')
  if (voltage !== '440' && voltage !== '230') continue

  const prevDest = c.destinationId
  const busId = ensureBus(c.originId, voltage, svc)

  c.service = svc
  c.destinationId = busId
  c.name = `${c.originId} → ${busId}`
  c.protectionName = `Q${svc}-${voltage}`
  c.spare = false
  c.virtual = false
  c.notes = TIE_NOTE
  fixed++

  if (
    typeof prevDest === 'string' &&
    prevDest.startsWith('SPARE-') &&
    prevDest !== busId
  ) {
    droppedSpareIds.add(prevDest)
  }
}

// Quitar placeholders SPARE solo usados por estos acopladores (si nadie más apunta).
const stillReferenced = new Set(
  file.circuits.map((c) => c.destinationId).filter(Boolean),
)
let removedSpareEq = 0
file.equipment = file.equipment.filter((e) => {
  if (!droppedSpareIds.has(e.id)) return true
  if (stillReferenced.has(e.id)) return true
  removedSpareEq++
  eqById.delete(e.id)
  return false
})

fs.writeFileSync(OUT, `${JSON.stringify(file)}\n`)

const sample = file.circuits
  .filter((c) => /^QVM-|^QNV-/.test(c.protectionName))
  .slice(0, 8)
  .map((c) => ({
    lcs: c.originId,
    prot: c.protectionName,
    svc: c.service,
    dest: c.destinationId,
  }))

console.log('Patched', OUT)
console.log({ fixed, removedSpareEq, sample })
