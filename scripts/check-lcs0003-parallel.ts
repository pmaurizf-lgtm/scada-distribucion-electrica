import { system690 } from '../src/data/system690.ts'
import { buildLcsBoardModel } from '../src/abtDownstream/index.ts'

const b = buildLcsBoardModel(system690, 'LCS-4PWS0003')
const v440 = b?.buses.find((x) => x.voltage === '440')
console.log(
  JSON.stringify(
    {
      ok: !!b,
      parallel: v440?.parallelIncoming && {
        prot: v440.parallelIncoming.circuit.protectionName,
        from: v440.parallelIncoming.equipment.id,
        line: v440.parallelIncoming.circuit.lineType,
        dest: v440.parallelIncoming.circuit.destinationId,
      },
      vsOutlets: v440?.sections
        .find((s) => s.service === 'VS')
        ?.outlets.map((o) => o.circuit.protectionName),
    },
    null,
    2,
  ),
)
