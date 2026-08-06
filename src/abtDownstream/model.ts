import type { Circuit, DistributionData, Equipment } from '../types'
import type { AbtChain, LoadCenter } from './types'
import downstreamSeed from '../data/abtDownstream.json'

type DownstreamSeed = {
  loadCenters: {
    id: string
    name: string
    transformerId: string
    voltage: '440' | '230'
    local?: string
    dcp10Id?: string
    /** Circuito TRF→LCS cuando se importe desde Excel 440/230 */
    feedCircuitId?: string
  }[]
}

const seed = downstreamSeed as DownstreamSeed

function isAbt(eq: Equipment): boolean {
  return eq.id.startsWith('ABT-')
}

/** Circuito normal ABT → TRF (uno por ABT en system690). */
function abtToTrfCircuit(data: DistributionData, abtId: string): Circuit | undefined {
  return data.circuits.find(
    (c) =>
      c.originId === abtId &&
      c.destinationId.startsWith('TRF-') &&
      !c.spare &&
      !c.virtual,
  )
}

/**
 * Construye cadenas ABT→TRF desde system690 y adjunta LCS del seed
 * (vacío hasta rellenar `abtDownstream.json`).
 */
export function buildAbtChains(data: DistributionData): AbtChain[] {
  const byId = new Map(data.equipment.map((e) => [e.id, e]))
  const chains: AbtChain[] = []

  for (const eq of data.equipment) {
    if (!isAbt(eq)) continue
    const toTrf = abtToTrfCircuit(data, eq.id)
    if (!toTrf) continue
    const trf = byId.get(toTrf.destinationId)
    if (!trf) continue

    const loadCenters: LoadCenter[] = seed.loadCenters
      .filter((lc) => lc.transformerId === trf.id)
      .map((lc) => ({
        id: lc.id,
        name: lc.name,
        voltage: lc.voltage,
        local: lc.local,
        dcp10Id: lc.dcp10Id,
        feedCircuit: lc.feedCircuitId
          ? data.circuits.find((c) => c.id === lc.feedCircuitId)
          : undefined,
        outlets: [],
      }))

    chains.push({
      abt: eq,
      toTransformer: toTrf,
      transformer: trf,
      loadCenters,
    })
  }

  return chains
}

export function findAbtChain(
  data: DistributionData,
  abtOrTrfId: string,
): AbtChain | undefined {
  return buildAbtChains(data).find(
    (c) => c.abt.id === abtOrTrfId || c.transformer.id === abtOrTrfId,
  )
}

/** IDs de equipo que pertenecen a la extensión aguas abajo (para filtros UI). */
export function abtDownstreamEquipmentIds(data: DistributionData): Set<string> {
  const ids = new Set<string>()
  for (const chain of buildAbtChains(data)) {
    ids.add(chain.abt.id)
    ids.add(chain.transformer.id)
    for (const lc of chain.loadCenters) {
      ids.add(lc.id)
      for (const o of lc.outlets) ids.add(o.equipment.id)
    }
  }
  return ids
}
