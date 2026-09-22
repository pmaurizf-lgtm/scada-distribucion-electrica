/**
 * Genera src/data/topologyRevC.json desde el Excel de lista de circuitos Rev.C.
 *
 * Uso:
 *   npx tsx scripts/build-topology-rev-c.mts [ruta-al-xlsm]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCircuitListExcel } from '../src/topology/parseCircuitListExcel'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const defaultExcel = path.join(
  process.env.USERPROFILE ?? '',
  'Downloads',
  '250924_F110-0300310005R_lista_circuitos_Rev.C.xlsm',
)

const excelPath = path.resolve(process.argv[2] ?? defaultExcel)
const outPath = path.join(root, 'src', 'data', 'topologyRevC.json')

if (!fs.existsSync(excelPath)) {
  console.error('No se encuentra el Excel Rev.C:', excelPath)
  process.exit(1)
}

const raw = fs.readFileSync(excelPath)
const buffer = raw.buffer.slice(
  raw.byteOffset,
  raw.byteOffset + raw.byteLength,
) as ArrayBuffer

const fileName = path.basename(excelPath)
console.log('Parseando', fileName, `(${(raw.length / 1024 / 1024).toFixed(1)} MiB)…`)

const started = Date.now()
const { data, stats } = parseCircuitListExcel(buffer, fileName)

const payload = {
  ...data,
  vessel: 'Lista circuitos Rev.C — sistema 690 V',
  sourceFile: fileName,
  revisionId: 'C',
}

fs.writeFileSync(outPath, `${JSON.stringify(payload)}\n`)
const outStat = fs.statSync(outPath)

console.log('OK →', outPath)
console.log({
  ms: Date.now() - started,
  outMiB: +(outStat.size / 1024 / 1024).toFixed(2),
  ...stats,
})

// Layout multi-barra SSB-2PWS2209 (misma estructura que Rev.D).
const { spawnSync } = await import('node:child_process')
const patch = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'patch-ssb-2pws2209-topology.mjs'), outPath],
  { stdio: 'inherit' },
)
if (patch.status !== 0) {
  console.error('Fallo el patch SSB-2PWS2209 sobre Rev.C')
  process.exit(patch.status ?? 1)
}