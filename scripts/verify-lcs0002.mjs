import { createRequire } from 'module'
import { readFileSync } from 'fs'

// Prefer compiled merge via dynamic import of built pieces is hard; read JSON + replicate checks
const data = JSON.parse(
  readFileSync(
    'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json',
    'utf8',
  ),
)

console.log(
  'chains',
  data.chains.map((c) => `${c.abtId}→${c.transformerId}→${c.loadCenterId}`),
)

const lcsCirc = data.circuits.filter(
  (c) =>
    c.originId === 'LCS-4PWS0002' ||
    c.destinationId === 'LCS-4PWS0002' ||
    c.originId === 'TRF-6PWS0002',
)
console.log('LCS0002-related circuits', lcsCirc.length)
console.log(
  'by type',
  {
    windings: lcsCirc.filter((c) => c.virtual).map((c) => c.protectionName),
    qvs: lcsCirc.filter((c) => /^QVS-/.test(c.protectionName)).map((c) => c.protectionName + '@' + c.voltage),
    qvm: lcsCirc.filter((c) => /^QVM-/.test(c.protectionName)).map((c) => c.protectionName),
    qnv: lcsCirc.filter((c) => /^QNV-/.test(c.protectionName)).map((c) => c.protectionName),
    outlets440: lcsCirc.filter((c) => c.originId === 'LCS-4PWS0002' && c.voltage === '440' && !/^Q/.test(c.protectionName)).length,
    outlets230: lcsCirc.filter((c) => c.originId === 'LCS-4PWS0002' && c.voltage === '230' && !/^Q/.test(c.protectionName)).length,
  },
)

const eqs = data.equipment.filter(
  (e) =>
    e.id === 'LCS-4PWS0002' ||
    e.id.startsWith('BUS-LCS-4PWS0002') ||
    data.circuits.some(
      (c) =>
        c.originId === 'LCS-4PWS0002' &&
        c.destinationId === e.id,
    ),
)
console.log(
  'equipment sample',
  eqs.slice(0, 15).map((e) => ({
    id: e.id,
    local: e.local,
    spare: e.spare,
    v: e.voltage,
  })),
)
const missingLocal = eqs.filter((e) => !e.spare && !e.virtual && !e.local)
console.log('missing local non-spare', missingLocal.map((e) => e.id))
