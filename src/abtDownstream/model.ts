import type {
  Circuit,
  DistributionData,
  Equipment,
  ServiceClass,
} from '../types'
import {
  abtDownstreamChainsMeta,
  windingNotesForTrf,
} from './merge'
import type {
  AbtChain,
  LcsBoardModel,
  LcsOutlet,
  LcsSection,
  LcsVoltageBus,
  LoadCenter,
  LoadCenterVoltage,
} from './types'

const SERVICE_ORDER: ServiceClass[] = ['VS', 'VM', 'NV']

function isAbt(eq: Equipment): boolean {
  return eq.id.startsWith('ABT-')
}

function voltageOf(c: Circuit): LoadCenterVoltage | null {
  const v = (c.voltage ?? '').replace(/\s*V$/i, '')
  if (v === '440') return '440'
  if (v === '230') return '230'
  return null
}

function isBusPlaceholder(id: string): boolean {
  return id.startsWith('BUS-LCS-')
}

function isSectionBreaker(c: Circuit): boolean {
  return /^QVM-|^QNV-/.test(c.protectionName)
}

function abtToTrfCircuit(
  data: DistributionData,
  abtId: string,
): Circuit | undefined {
  return data.circuits.find(
    (c) =>
      c.originId === abtId &&
      c.destinationId.startsWith('TRF-') &&
      !c.spare &&
      !c.virtual,
  )
}

/** Entrada TRF→LCS preferida (QVS-440, si no QVS-230). */
export function trfLoadCenterFeed(
  data: DistributionData,
  trfId: string,
): { circuit: Circuit; equipment: Equipment } | null {
  const feeds = data.circuits.filter(
    (c) =>
      !c.virtual &&
      c.originId === trfId &&
      c.destinationId.startsWith('LCS-') &&
      /^QVS-/.test(c.protectionName),
  )
  const preferred =
    feeds.find((c) => c.protectionName === 'QVS-440') ?? feeds[0]
  if (!preferred) return null
  const equipment = data.equipment.find((e) => e.id === preferred.destinationId)
  if (!equipment) return null
  return { circuit: preferred, equipment }
}

export function buildLcsBoardModel(
  data: DistributionData,
  lcsId: string,
): LcsBoardModel | null {
  const lcs = data.equipment.find((e) => e.id === lcsId)
  if (!lcs) return null

  const incomingAll = data.circuits.filter(
    (c) =>
      !c.virtual &&
      c.destinationId === lcsId &&
      c.originId.startsWith('TRF-') &&
      /^QVS-/.test(c.protectionName),
  )
  if (incomingAll.length === 0) return null

  const transformerId = incomingAll[0].originId
  const fromLcs = data.circuits.filter(
    (c) => !c.virtual && c.originId === lcsId,
  )

  const buses: LcsVoltageBus[] = []
  for (const voltage of ['440', '230'] as LoadCenterVoltage[]) {
    const incoming =
      incomingAll.find((c) => voltageOf(c) === voltage) ??
      incomingAll.find((c) => c.protectionName === `QVS-${voltage}`)
    if (!incoming) continue

    const inVoltage = fromLcs.filter((c) => voltageOf(c) === voltage)
    const sections: LcsSection[] = []

    for (const service of SERVICE_ORDER) {
      const sectionBreaker = inVoltage.find(
        (c) =>
          isSectionBreaker(c) &&
          c.service === service &&
          isBusPlaceholder(c.destinationId),
      )
      const outlets: LcsOutlet[] = inVoltage
        .filter(
          (c) =>
            c.service === service &&
            !isSectionBreaker(c) &&
            !isBusPlaceholder(c.destinationId),
        )
        .map((circuit) => {
          const equipment = data.equipment.find(
            (e) => e.id === circuit.destinationId,
          )
          if (!equipment) return null
          return {
            circuit,
            equipment,
            service: circuit.service ?? null,
          }
        })
        .filter((x): x is LcsOutlet => !!x)
        .sort((a, b) =>
          a.circuit.protectionName.localeCompare(
            b.circuit.protectionName,
            undefined,
            { numeric: true },
          ),
        )

      if (!sectionBreaker && outlets.length === 0) continue
      sections.push({ service, sectionBreaker, outlets })
    }

    buses.push({ voltage, incoming, sections })
  }

  if (buses.length === 0) return null
  return { lcs, transformerId, buses }
}

export function buildAbtChains(data: DistributionData): AbtChain[] {
  const byId = new Map(data.equipment.map((e) => [e.id, e]))
  const chains: AbtChain[] = []
  const metaByTrf = new Map(
    abtDownstreamChainsMeta.map((c) => [c.transformerId, c]),
  )

  for (const eq of data.equipment) {
    if (!isAbt(eq)) continue
    const toTrf = abtToTrfCircuit(data, eq.id)
    if (!toTrf) continue
    const trf = byId.get(toTrf.destinationId)
    if (!trf) continue

    const meta = metaByTrf.get(trf.id)
    const loadCenters: LoadCenter[] = []
    let lcsBoard: ReturnType<typeof buildLcsBoardModel> | undefined

    if (meta) {
      const feed = trfLoadCenterFeed(data, trf.id)
      const board = buildLcsBoardModel(data, meta.loadCenterId)
      lcsBoard = board ?? undefined
      const lcEq = byId.get(meta.loadCenterId)
      if (lcEq) {
        const outlets =
          board?.buses.flatMap((b) =>
            b.sections.flatMap((s) => s.outlets),
          ) ?? []
        loadCenters.push({
          id: lcEq.id,
          name: meta.loadCenterName ?? lcEq.name,
          voltage: '440/230',
          local: lcEq.local,
          dcp10Id: lcEq.dcp10Id,
          feedCircuit: feed?.circuit,
          outlets,
        })
      }
    }

    chains.push({
      abt: eq,
      toTransformer: toTrf,
      transformer: trf,
      loadCenters,
      lcsBoard: lcsBoard ?? undefined,
    })
  }

  return chains
}

export function findAbtChain(
  data: DistributionData,
  id: string,
): AbtChain | undefined {
  return buildAbtChains(data).find(
    (c) =>
      c.abt.id === id ||
      c.transformer.id === id ||
      c.loadCenters.some((lc) => lc.id === id) ||
      c.lcsBoard?.lcs.id === id,
  )
}

export function isLcsEquipment(id: string): boolean {
  return id.startsWith('LCS-')
}

export function isTrfWithLoadCenter(
  data: DistributionData,
  trfId: string,
): boolean {
  return trfLoadCenterFeed(data, trfId) != null
}

export { windingNotesForTrf }
