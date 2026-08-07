import { system690 } from '../src/data/system690.ts'
import { buildLcsBoardModel } from '../src/abtDownstream/index.ts'

const b = buildLcsBoardModel(system690, 'LCS-4PWS0003')
const v = b?.buses.find((x) => x.voltage === '440')
for (const s of v?.sections ?? []) {
  console.log(
    s.service,
    s.outlets.map((o) => o.circuit.protectionName).join(','),
  )
}
