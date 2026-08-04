import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'
import type {
  Circuit,
  DistributionData,
  Equipment,
  EquipmentKind,
  ProtectionState,
  ProtectionStatusMap,
} from '../types'

export type EquipmentNodeData = {
  equipment: Equipment
  label: string
  highlight?: 'target' | 'upstream' | 'dim'
} & Record<string, unknown>

export type CircuitEdgeData = {
  circuit: Circuit
  protectionState?: ProtectionState
  highlight?: 'upstream' | 'dim'
} & Record<string, unknown>

const KIND_RANK: Record<EquipmentKind, number> = {
  generador: 0,
  conversion: 1,
  cuadro_principal: 2,
  cuadro_secundario: 3,
  consumidor: 4,
}

const BUS_WIDTH = 360
const BUS_HEIGHT = 56

/** Cerrada = energizada (rojo); abierta = desenergizada (verde) */
export const PROTECTION_COLORS: Record<ProtectionState, string> = {
  cerrada: '#d64545',
  abierta: '#3cb371',
}

/** Color de trazo según tipo de alimentación */
export const LINE_COLORS = {
  normal: '#e6c200',
  alternativa: '#3b82f6',
} as const

type BoardSection = '1A' | '1B' | '2A' | '2B'

/** Columnas tipo plano unifilar PDF (hojas 1A/1B/2A/2B) */
const SECTION_X: Record<BoardSection, number> = {
  '1A': 40,
  '1B': 480,
  '2A': 1180,
  '2B': 1620,
}

const Y_LOAD_TOP = 40
const Y_BUS = 980
const Y_PANEL = 1080
const Y_GEN = 1200
const ROW_GAP = 88

export function buildGraph(
  data: DistributionData,
  protectionStatus: ProtectionStatusMap = {},
): {
  nodes: Node<EquipmentNodeData>[]
  edges: Edge<CircuitEdgeData>[]
} {
  const nodes: Node<EquipmentNodeData>[] = data.equipment.map((eq) => ({
    id: eq.id,
    type: 'equipment',
    position: { x: 0, y: 0 },
    data: { equipment: eq, label: eq.name },
    style:
      eq.id.startsWith('MSB-6PWS') || eq.virtual
        ? { width: BUS_WIDTH, minHeight: BUS_HEIGHT }
        : undefined,
  }))

  const sourceCounters = new Map<string, number>()
  const pairCounters = new Map<string, number>()

  const sortedCircuits = [...data.circuits].sort((a, b) => {
    if (a.originId !== b.originId) return a.originId.localeCompare(b.originId)
    if (a.lineType !== b.lineType) return a.lineType === 'normal' ? -1 : 1
    return a.destinationId.localeCompare(b.destinationId)
  })

  const edges: Edge<CircuitEdgeData>[] = sortedCircuits.map((circuit) => {
    const isAlt = circuit.lineType === 'alternativa'
    const protectionState = protectionStatus[circuit.id]
    const stroke = isAlt ? LINE_COLORS.alternativa : LINE_COLORS.normal

    const srcKey = circuit.originId
    const pairKey = `${srcKey}→${circuit.destinationId}`
    const srcIdx = sourceCounters.get(srcKey) ?? 0
    sourceCounters.set(srcKey, srcIdx + 1)
    const pairIdx = pairCounters.get(pairKey) ?? 0
    pairCounters.set(pairKey, pairIdx + 1)

    const offset = (pairIdx - 0.5) * 18 + (isAlt ? 12 : -12) + (srcIdx % 4) * 5

    return {
      id: circuit.id,
      source: circuit.originId,
      target: circuit.destinationId,
      sourceHandle: isAlt ? 'out-alt' : 'out-normal',
      targetHandle: isAlt ? 'in-alt' : 'in-normal',
      type: 'smoothstep',
      pathOptions: { offset, borderRadius: 10 },
      animated: false,
      label: undefined,
      data: { circuit, protectionState },
      className: [
        isAlt ? 'edge-alternativa' : 'edge-normal',
        protectionState ? `edge-prot-${protectionState}` : '',
        circuit.virtual ? 'edge-virtual' : '',
      ]
        .filter(Boolean)
        .join(' '),
      style: {
        stroke,
        strokeWidth: circuit.virtual ? 2 : isAlt ? 2 : 2.5,
        opacity: circuit.virtual ? 0.55 : 0.92,
      },
      zIndex: isAlt ? 1 : 2,
    }
  })

  return { nodes: layoutUnifilar(nodes, data), edges }
}

/** Reposiciona un subconjunto con layout compacto (vista búsqueda). */
export function layoutSubtree(
  nodes: Node<EquipmentNodeData>[],
  edges: Edge<CircuitEdgeData>[],
): Node<EquipmentNodeData>[] {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    nodesep: 40,
    ranksep: 78,
    edgesep: 16,
    marginx: 20,
    marginy: 20,
  })

  for (const node of nodes) {
    const bus = node.id.startsWith('MSB-6PWS')
    g.setNode(node.id, {
      width: bus ? 280 : 180,
      height: bus ? 52 : 64,
    })
  }

  let edgeSeq = 0
  for (const edge of edges) {
    const circuit = (edge.data as CircuitEdgeData | undefined)?.circuit
    const isAlt = circuit?.lineType === 'alternativa'
    g.setEdge(
      edge.source,
      edge.target,
      { weight: isAlt ? 1 : 5, minlen: 1 },
      `e${edgeSeq++}`,
    )
  }

  dagre.layout(g)

  return nodes
    .map((node) => {
      const pos = g.node(node.id)
      if (!pos) return node
      const bus = node.id.startsWith('MSB-6PWS')
      const w = bus ? 280 : 180
      const h = bus ? 52 : 64
      return {
        ...node,
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      }
    })
    .sort(
      (a, b) =>
        KIND_RANK[a.data.equipment.kind] - KIND_RANK[b.data.equipment.kind],
    )
}

/**
 * Layout unifilar alineado al plano PDF (hojas 1A/1B/2A/2B):
 * generadores abajo → paneles/barra → salidas hacia arriba por sección QxA/QxB.
 */
function layoutUnifilar(
  nodes: Node<EquipmentNodeData>[],
  data: DistributionData,
): Node<EquipmentNodeData>[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const positions = new Map<string, { x: number; y: number }>()

  const place = (id: string, x: number, y: number) => {
    if (!byId.has(id) || positions.has(id)) return
    positions.set(id, { x, y })
  }

  // Generadores (como en PDF: abajo)
  place('SDG-GENS0001', SECTION_X['1A'] + 20, Y_GEN)
  place('SDG-GENS0002', SECTION_X['1B'] + 20, Y_GEN)
  place('SDG-GENS0003', SECTION_X['2A'] + 20, Y_GEN)
  place('SDG-GENS0004', SECTION_X['2B'] + 20, Y_GEN)

  // Paneles de generador / incomer
  place('PNL-MSB1001A', SECTION_X['1A'] + 20, Y_PANEL)
  place('PNL-MSB1001B', SECTION_X['1B'] + 20, Y_PANEL)
  place('PNL-MSB2001A', SECTION_X['2A'] + 20, Y_PANEL)
  place('PNL-MSB2001B', SECTION_X['2B'] + 20, Y_PANEL)

  // Barras lógicas (centro del cuadro, como MSB del plano)
  place('MSB-6PWS0001', (SECTION_X['1A'] + SECTION_X['1B']) / 2 - 40, Y_BUS)
  place('MSB-6PWS0002', (SECTION_X['2A'] + SECTION_X['2B']) / 2 - 40, Y_BUS)

  // Paneles de sección del cuadro (debajo de la barra / a nivel bus)
  for (const eq of data.equipment) {
    if (!/^PNL-MSB/.test(eq.id) || positions.has(eq.id)) continue
    const sec = panelSection(eq.id)
    if (!sec) continue
    const col = SECTION_X[sec]
    // Distribuir paneles 2..9 alrededor de la barra
    const n = Number(eq.id.match(/MSB(\d{4})/)?.[1]?.slice(2) ?? 2)
    const slot = ((n - 2) % 8) * 28
    place(eq.id, col + slot * 0.15, Y_BUS + 55)
  }

  // Feeders directos desde paneles MSB: ordenados por Q1A01, Q1A02… hacia arriba
  const feederCircuits = data.circuits
    .filter(
      (c) =>
        !c.virtual &&
        /^PNL-MSB/.test(c.originId) &&
        !/^PNL-MSB/.test(c.destinationId),
    )
    .map((c) => ({ circuit: c, key: feederKey(c) }))
    .filter((x): x is { circuit: Circuit; key: FeederKey } => x.key != null)
    .sort((a, b) => {
      if (a.key.section !== b.key.section)
        return a.key.section.localeCompare(b.key.section)
      return a.key.num - b.key.num
    })

  const sectionRows: Record<BoardSection, number> = {
    '1A': 0,
    '1B': 0,
    '2A': 0,
    '2B': 0,
  }

  // Preferir alimentación NORMAL para anclar el destino
  const destPlaced = new Set<string>()
  for (const preferAlt of [false, true]) {
    for (const { circuit, key } of feederCircuits) {
      const isAlt = circuit.lineType === 'alternativa'
      if (isAlt !== preferAlt) continue
      if (destPlaced.has(circuit.destinationId)) continue
      const row = sectionRows[key.section]++
      const x = SECTION_X[key.section] + (isAlt ? 24 : 0)
      const y = Y_LOAD_TOP + row * ROW_GAP
      place(circuit.destinationId, x, y)
      destPlaced.add(circuit.destinationId)
    }
  }

  // Resto de equipos (aguas abajo de CCM/ABT…): columnas sobre su padre de mayor rango
  const remaining = data.equipment.filter((e) => !positions.has(e.id))
  const parentOf = (id: string) => {
    const inns = data.circuits.filter(
      (c) => c.destinationId === id && !c.virtual,
    )
    const normal = inns.find((c) => c.lineType === 'normal')
    return (normal ?? inns[0])?.originId
  }

  // Varias pasadas para propagar desde nodos ya posicionados
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    const childCount = new Map<string, number>()
    for (const eq of remaining) {
      if (positions.has(eq.id)) continue
      const parent = parentOf(eq.id)
      if (!parent || !positions.has(parent)) continue
      const p = positions.get(parent)!
      const idx = childCount.get(parent) ?? 0
      childCount.set(parent, idx + 1)
      const x = p.x + (idx % 3) * 210 - 210
      const y = Math.max(Y_LOAD_TOP - 20, p.y - ROW_GAP - Math.floor(idx / 3) * 70)
      place(eq.id, x, y)
      moved = true
    }
    if (!moved) break
  }

  // Huérfanos: fila inferior derecha
  let orphan = 0
  for (const eq of data.equipment) {
    if (positions.has(eq.id)) continue
    place(eq.id, 2100 + (orphan % 4) * 220, 200 + Math.floor(orphan / 4) * 90)
    orphan++
  }

  return nodes
    .map((node) => {
      const pos = positions.get(node.id) ?? { x: 0, y: 0 }
      const bus = node.id.startsWith('MSB-6PWS')
      return {
        ...node,
        position: pos,
        style: bus
          ? { width: BUS_WIDTH, minHeight: BUS_HEIGHT }
          : node.style,
      }
    })
    .sort(
      (a, b) =>
        KIND_RANK[a.data.equipment.kind] - KIND_RANK[b.data.equipment.kind],
    )
}

interface FeederKey {
  section: BoardSection
  num: number
}

function feederKey(circuit: Circuit): FeederKey | null {
  const raw = `${circuit.circuitRef ?? ''} ${circuit.protectionName ?? ''}`
  const m = raw.match(/Q([12])([AB])(\d{1,2})/i)
  if (m) {
    return {
      section: `${m[1]}${m[2].toUpperCase()}` as BoardSection,
      num: Number(m[3]),
    }
  }
  const sec = panelSection(circuit.originId)
  if (!sec) return null
  return { section: sec, num: 99 }
}

function panelSection(panelId: string): BoardSection | null {
  // PNL-MSB1002A → 1A (PROA SA); PNL-MSB2003B → 2B (POPA SB)
  const m = panelId.match(/^PNL-MSB([12])\d{2}([AB])$/i)
  if (!m) return null
  return `${m[1]}${m[2].toUpperCase()}` as BoardSection
}
