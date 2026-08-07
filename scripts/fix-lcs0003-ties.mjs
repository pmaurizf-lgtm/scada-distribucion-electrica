/**
 * Repara acopladores QVM/QNV de LCS-4PWS0003 (servicio VM/NV, no spare).
 */
import { readFileSync, writeFileSync } from 'fs'

const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'
const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
const LCS = 'LCS-4PWS0003'

function ensureBus(voltage, svc) {
  const id = `BUS-${LCS}-${voltage}-${svc}`
  if (!data.equipment.some((e) => e.id === id)) {
    data.equipment.push({
      id,
      name: `Barra ${voltage} V · ${svc}`,
      kind: 'cuadro_secundario',
      voltage: String(voltage),
      virtual: true,
      spare: false,
    })
  }
  return id
}

data.equipment = data.equipment.filter(
  (e) =>
    e.id !== `BUS-${LCS}-440-VS` && e.id !== `BUS-${LCS}-230-VS`,
)

for (const c of data.circuits) {
  if (c.originId !== LCS) continue
  const isQvm =
    /^QVM/i.test(c.protectionName) || /QVM/i.test(c.circuitRef || '')
  const isQnv =
    /^QNV/i.test(c.protectionName) || /QNV/i.test(c.circuitRef || '')
  if (!isQvm && !isQnv) continue

  const voltage = String(c.voltage).replace(/\s*V$/i, '')
  const svc = isQvm ? 'VM' : 'NV'
  const busId = ensureBus(voltage, svc)
  c.service = svc
  c.destinationId = busId
  c.name = `${LCS} → ${busId}`
  c.protectionName = isQvm ? `QVM-${voltage}` : `QNV-${voltage}`
  c.spare = false
  c.virtual = false
  c.notes = 'Acoplador de sección LCS'
}

writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
console.log(
  'fixed',
  data.circuits
    .filter((c) => c.originId === LCS && /^QVM-|^QNV-/.test(c.protectionName))
    .map((c) => ({
      prot: c.protectionName,
      svc: c.service,
      dest: c.destinationId,
      spare: c.spare,
    })),
)
