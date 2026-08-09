/**
 * Downstream 440 + 230 + Lighting para LCS-4PWS0002…0006
 * (misma lógica que LCS-0001; SSB especiales se afinan después).
 *
 * Uso:
 *   node scripts/import-lcs-downstream-all.mjs
 *   node scripts/import-lcs-downstream-all.mjs 2 3 4
 */
import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const nums = (
  process.argv.slice(2).length ? process.argv.slice(2) : ['2', '3', '4', '5', '6']
).map((n) => {
  const v = Number(String(n).replace(/^0+/, '') || n)
  if (!Number.isFinite(v) || v < 1 || v > 6) {
    console.error('Índice LCS inválido:', n)
    process.exit(1)
  }
  return v
})

const scripts = [
  'import-lcs0001-downstream-440.mjs',
  'import-lcs0001-downstream-230.mjs',
  'import-lcs0001-downstream-lighting.mjs',
]

for (const v of nums) {
  const id = `LCS-4PWS${String(v).padStart(4, '0')}`
  console.log(`\n======== ${id} ========`)
  for (const script of scripts) {
    console.log(`\n--- ${script} ${id} ---`)
    const r = spawnSync(process.execPath, [join(__dir, script), id], {
      cwd: root,
      stdio: 'inherit',
    })
    if (r.status !== 0) {
      console.error(`Falló ${script} para ${id} (exit ${r.status})`)
      process.exit(r.status ?? 1)
    }
  }
}

console.log('\nOK: downstream LCS', nums.map((v) => `000${v}`.slice(-4)).join(', '))
