import { system690 } from '../src/data/system690.ts'
import {
  buildLcsBoardModel,
  buildAbtChains,
  trfLoadCenterFeed,
  windingNotesForTrf,
} from '../src/abtDownstream/index.ts'

const b = buildLcsBoardModel(system690, 'LCS-4PWS0003')
console.log(
  JSON.stringify(
    {
      ok: !!b,
      lcs: b?.lcs && { id: b.lcs.id, name: b.lcs.name, local: b.lcs.local },
      trf: b?.transformerId,
      buses: b?.buses.map((x) => ({
        v: x.voltage,
        in: x.incoming.protectionName,
        sec: x.sections.map((s) => ({
          s: s.service,
          brk: s.sectionBreaker?.protectionName,
          n: s.outlets.length,
        })),
      })),
      feed: trfLoadCenterFeed(system690, 'TRF-6PWS0003')?.circuit
        .protectionName,
      wind: windingNotesForTrf('TRF-6PWS0003'),
      chains: buildAbtChains(system690).map((c) => ({
        a: c.abt.id,
        t: c.transformer.id,
        l: c.lcsBoard?.lcs.id,
        buses: c.lcsBoard?.buses.length,
      })),
    },
    null,
    2,
  ),
)
