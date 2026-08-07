/**
 * Limpia valores basura del enrich (local NaN, potencias absurdas en RESPETO)
 * y rellena nombres/desc desde Excel solo cuando K/L son texto válido.
 */
import { readFileSync, writeFileSync } from 'fs'

const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'
const data = JSON.parse(readFileSync(jsonPath, 'utf8'))

function isBadLocal(v) {
  if (v == null) return true
  const s = String(v).trim()
  return !s || s === 'NaN' || s === 'undefined' || s === '#N/A' || s === '#¡VALOR!'
}

function isPumaId(v) {
  return typeof v === 'string' && /^[A-Z]{2,}-/.test(v)
}

let cleanedEq = 0
let cleanedCirc = 0

for (const eq of data.equipment) {
  if (isBadLocal(eq.local)) {
    if (eq.local != null) cleanedEq++
    delete eq.local
  }
}

for (const c of data.circuits) {
  // Potencias absurdas (p.ej. RESPETO con AJ=44630)
  if (c.spare || c.destinationId?.startsWith('SPARE-')) {
    if (c.pKWe != null && c.pKWe > 5000) {
      delete c.pKWe
      cleanedCirc++
    }
    if (c.qKVAr != null && Math.abs(c.qKVAr) > 5000) delete c.qKVAr
    if (c.sKVA != null && c.sKVA > 5000) delete c.sKVA
  }
  // Redondeo razonable para UI
  for (const k of ['pKWe', 'qKVAr', 'sKVA', 'ibA', 'pnKW']) {
    if (typeof c[k] === 'number' && Number.isFinite(c[k])) {
      c[k] = Math.round(c[k] * 1e6) / 1e6
    }
  }
}

writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
console.log({ cleanedEq, cleanedCirc, isPumaId: isPumaId('SSB-4PWS1101') })
