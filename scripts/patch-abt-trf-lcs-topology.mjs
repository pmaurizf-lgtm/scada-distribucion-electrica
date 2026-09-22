/**
 * Alinea ABT→TRF→LCS de una topología parseada (p. ej. Rev.C) con el modelo Rev.D:
 * - ABT→TRF: un solo enlace real; fases 01/02/03 extras → virtuales
 * - TRF→LCS: 11/12/13/21/22/23 → virtuales (devanados); QVS-440/230 reales
 *
 * Sin esto el árbol de alimentaciones dibuja stubs colgando bajo el ABT y
 * varias patas (21/22/23/QVS) hacia el mismo LCS, con cables atravesando el recuadro.
 *
 * Uso: node scripts/patch-abt-trf-lcs-topology.mjs [ruta.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = path.join(__dirname, '../src/data/topologyRevC.json')
const OUT = path.resolve(process.argv[2] ?? DEFAULT_OUT)

const WINDING_NOTE = 'Devanado secundario banco TRF (fase)'
const ABT_PHASE_NOTE = 'Fase ABT→TRF (banco)'
const PHASE_PROT = /^(11|12|13|21|22|23)$/i

const file = JSON.parse(fs.readFileSync(OUT, 'utf8'))
if (!Array.isArray(file.circuits)) {
  console.error('JSON sin circuits:', OUT)
  process.exit(1)
}

let abtCollapsed = 0
let windingsVirtualized = 0

/** @type {Map<string, object[]>} */
const abtToTrf = new Map()
for (const c of file.circuits) {
  if (c.virtual) continue
  if (!/^ABT-/i.test(c.originId) || !/^TRF-/i.test(c.destinationId)) continue
  const key = `${c.originId}>${c.destinationId}`
  const list = abtToTrf.get(key) ?? []
  list.push(c)
  abtToTrf.set(key, list)
}

for (const [, list] of abtToTrf) {
  if (list.length <= 1) continue
  list.sort((a, b) =>
    String(a.protectionName).localeCompare(String(b.protectionName), undefined, {
      numeric: true,
    }),
  )
  // Conservar el primero como enlace único (cable ABT→TRF).
  const keep = list[0]
  keep.protectionName = keep.protectionName || '—'
  keep.lineType = keep.lineType || 'normal'
  for (let i = 1; i < list.length; i++) {
    list[i].virtual = true
    list[i].notes = ABT_PHASE_NOTE
    abtCollapsed++
  }
}

for (const c of file.circuits) {
  if (!/^TRF-/i.test(c.originId) || !/^LCS-/i.test(c.destinationId)) continue
  const prot = String(c.protectionName ?? '')
  if (!PHASE_PROT.test(prot)) continue
  if (c.virtual && c.notes === WINDING_NOTE) continue
  c.virtual = true
  c.notes = WINDING_NOTE
  windingsVirtualized++
}

fs.writeFileSync(OUT, `${JSON.stringify(file)}\n`)

const sample = ['ABT-6PWS0002', 'TRF-6PWS0002', 'ABT-6PWS0004', 'TRF-6PWS0004']
console.log('Patched', OUT)
console.log({ abtCollapsed, windingsVirtualized })
for (const id of sample) {
  const out = file.circuits.filter((c) => c.originId === id)
  console.log(
    id,
    out.map((c) => ({
      p: c.protectionName,
      d: c.destinationId,
      v: !!c.virtual,
    })),
  )
}
