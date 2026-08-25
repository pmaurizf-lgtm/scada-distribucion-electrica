import type { Circuit, DistributionData, Equipment } from '../types'
import { incomingFeeds, isPendingFeed } from '../utils/cascadeModel'
import {
  findEquipmentByQuery,
  getUpstreamTrace,
  type UpstreamTrace,
} from '../utils/upstream'
import type {
  FeedLegInfo,
  ForestNode,
  StartupDestination,
  StartupGroup,
  StartupReport,
} from './types'

function eqMap(data: DistributionData): Map<string, Equipment> {
  return new Map(data.equipment.map((e) => [e.id, e]))
}

function legFromCircuit(
  c: Circuit,
  equipment: Map<string, Equipment>,
): FeedLegInfo {
  const eq = equipment.get(c.originId)
  return {
    equipmentId: c.originId,
    equipmentName: eq?.name ?? c.originId,
    local: eq?.local,
    protectionName: c.protectionName,
    circuitId: c.id,
    lineType: c.lineType === 'alternativa' ? 'alternativa' : 'normal',
  }
}

function pickPrimaryIncoming(feeds: Circuit[]): Circuit | undefined {
  const real = feeds.filter((c) => !c.virtual && !isPendingFeed(c))
  const norms = real.filter((c) => c.lineType === 'normal')
  if (norms.length) return norms[0]
  return real[0]
}

function pickAltIncoming(feeds: Circuit[], primary?: Circuit): Circuit | undefined {
  const real = feeds.filter(
    (c) =>
      !c.virtual &&
      c.id !== primary?.id &&
      (c.lineType === 'alternativa' || isPendingFeed(c)),
  )
  return real[0]
}

/**
 * Construye informe de puesta en marcha: destinos → grupos por origen común → bosque.
 */
export function buildStartupReport(
  queries: string[],
  data: DistributionData,
  title = 'Alimentaciones puesta en marcha',
): StartupReport {
  const equipment = eqMap(data)
  const unresolved: string[] = []
  const resolvedIds: string[] = []
  const destByOrigin = new Map<
    string,
    { dest: StartupDestination; hop: Circuit }[]
  >()

  for (const query of queries) {
    const found = findEquipmentByQuery(data.equipment, query)
    if (!found) {
      unresolved.push(query)
      continue
    }
    resolvedIds.push(found.id)
    const incoming = incomingFeeds(data, found.id)
    const hop = pickPrimaryIncoming(incoming)
    if (!hop) {
      // Sin acometida: el propio equipo es origen (como L='-' en MEP)
      const self: StartupDestination = {
        query,
        equipmentId: found.id,
        equipmentName: found.name,
        local: found.local,
        protectionName: '—',
        circuitId: '',
        lineType: 'normal',
      }
      const list = destByOrigin.get(found.id) ?? []
      list.push({
        dest: self,
        hop: {
          id: `self-${found.id}`,
          name: found.id,
          originId: found.id,
          destinationId: found.id,
          protectionName: '—',
          lineType: 'normal',
        },
      })
      destByOrigin.set(found.id, list)
      continue
    }
    const originId = hop.originId
    const dest: StartupDestination = {
      query,
      equipmentId: found.id,
      equipmentName: found.name,
      local: found.local,
      protectionName: hop.protectionName,
      circuitId: hop.id,
      lineType: hop.lineType === 'alternativa' ? 'alternativa' : 'normal',
    }
    const list = destByOrigin.get(originId) ?? []
    list.push({ dest, hop })
    destByOrigin.set(originId, list)
  }

  const groups: StartupGroup[] = []
  const allCircuits: Circuit[] = []
  const seenCircuits = new Set<string>()

  for (const [originId, items] of destByOrigin) {
    const originEq = equipment.get(originId)
    const originIncoming = incomingFeeds(data, originId)
    const normC = pickPrimaryIncoming(originIncoming)
    const altC = pickAltIncoming(originIncoming, normC)
    let originTrace: UpstreamTrace = getUpstreamTrace(originId, data.circuits)
    // Si el origen es el propio destino sin feeds aguas arriba útiles
    if (!originTrace.circuits.length && items.length === 1) {
      originTrace = getUpstreamTrace(items[0].dest.equipmentId, data.circuits)
    }

    for (const c of originTrace.circuits) {
      if (!seenCircuits.has(c.id)) {
        seenCircuits.add(c.id)
        allCircuits.push(c)
      }
    }
    for (const { hop } of items) {
      if (hop.id && !hop.id.startsWith('self-') && !seenCircuits.has(hop.id)) {
        seenCircuits.add(hop.id)
        allCircuits.push(hop)
      }
    }

    groups.push({
      originId,
      originName: originEq?.name ?? originId,
      originLocal: originEq?.local,
      norm: normC ? legFromCircuit(normC, equipment) : undefined,
      alt: altC ? legFromCircuit(altC, equipment) : undefined,
      destinations: items.map((i) => i.dest),
      originTrace,
    })
  }

  groups.sort((a, b) => a.originId.localeCompare(b.originId, 'es'))

  const forest = buildMergedForest(groups, equipment)
  const allEquipment = [
    ...new Map(
      [...equipment.values()]
        .filter((e) =>
          groups.some(
            (g) =>
              g.originId === e.id ||
              g.destinations.some((d) => d.equipmentId === e.id) ||
              g.originTrace.equipmentIds.includes(e.id) ||
              g.norm?.equipmentId === e.id ||
              g.alt?.equipmentId === e.id,
          ),
        )
        .map((e) => [e.id, e]),
    ).values(),
  ]

  return {
    title,
    destinationsRequested: queries,
    resolvedIds: [...new Set(resolvedIds)],
    unresolved,
    groups,
    forest,
    allCircuits,
    allEquipment,
  }
}

function isMsbId(id: string): boolean {
  return /^MSB-6PWS/i.test(id)
}

/**
 * Bosque fusionado: MSB → … → orígenes → destinos (nodos intermedios una sola vez).
 */
function buildMergedForest(
  groups: StartupGroup[],
  equipment: Map<string, Equipment>,
): ForestNode[] {
  // parentId -> Map<childId, edge meta>
  type Edge = {
    childId: string
    protectionName?: string
    lineType?: 'normal' | 'alternativa'
  }
  const childrenOf = new Map<string, Map<string, Edge>>()
  const nodeIds = new Set<string>()

  const addEdge = (
    parentId: string,
    childId: string,
    protectionName?: string,
    lineType?: 'normal' | 'alternativa',
  ) => {
    if (parentId === childId) return
    nodeIds.add(parentId)
    nodeIds.add(childId)
    let map = childrenOf.get(parentId)
    if (!map) {
      map = new Map()
      childrenOf.set(parentId, map)
    }
    if (!map.has(childId)) {
      map.set(childId, { childId, protectionName, lineType })
    }
  }

  for (const g of groups) {
    // Cadenas aguas arriba: para cada circuito del trace, origin → destination
    // getUpstreamTrace recoge dest←origin; edge dibujable origin → dest
    for (const c of g.originTrace.circuits) {
      if (c.virtual) continue
      addEdge(
        c.originId,
        c.destinationId,
        c.protectionName,
        c.lineType === 'alternativa' ? 'alternativa' : 'normal',
      )
    }
    // Origen → destinos
    for (const d of g.destinations) {
      if (d.equipmentId === g.originId) {
        nodeIds.add(g.originId)
        continue
      }
      addEdge(
        g.originId,
        d.equipmentId,
        d.protectionName,
        d.lineType,
      )
    }
  }

  const kindOf = (id: string): ForestNode['kind'] => {
    if (isMsbId(id)) return 'msb'
    if (groups.some((g) => g.originId === id)) return 'origin'
    if (groups.some((g) => g.destinations.some((d) => d.equipmentId === id)))
      return 'destination'
    if (/^PNL-MSB/i.test(id)) return 'panel'
    return 'equipment'
  }

  const buildNode = (id: string, seen: Set<string>): ForestNode => {
    const eq = equipment.get(id)
    const node: ForestNode = {
      id,
      name: eq?.name ?? id,
      local: eq?.local,
      kind: kindOf(id),
      children: [],
    }
    if (seen.has(id)) return node
    seen.add(id)
    const kids = childrenOf.get(id)
    if (kids) {
      for (const edge of [...kids.values()].sort((a, b) =>
        a.childId.localeCompare(b.childId, 'es'),
      )) {
        const child = buildNode(edge.childId, seen)
        child.protectionName = edge.protectionName
        child.lineType = edge.lineType
        node.children.push(child)
      }
    }
    return node
  }

  // Raíces: MSB presentes, o nodos sin padre en el grafo
  const hasParent = new Set<string>()
  for (const map of childrenOf.values()) {
    for (const e of map.values()) hasParent.add(e.childId)
  }
  const roots = [...nodeIds].filter((id) => !hasParent.has(id))
  roots.sort((a, b) => {
    const am = isMsbId(a) ? 0 : 1
    const bm = isMsbId(b) ? 0 : 1
    if (am !== bm) return am - bm
    return a.localeCompare(b, 'es')
  })

  if (!roots.length) {
    // Solo destinos huérfanos
    return groups.flatMap((g) =>
      g.destinations.map((d) => ({
        id: d.equipmentId,
        name: d.equipmentName,
        local: d.local,
        kind: 'destination' as const,
        protectionName: d.protectionName,
        children: [],
      })),
    )
  }

  const seen = new Set<string>()
  return roots.map((id) => buildNode(id, seen))
}
