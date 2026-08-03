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

const NODE_WIDTH = 200
const NODE_HEIGHT = 78

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
  }))

  // Índices para desplazar trazos que salen/entran del mismo nodo
  const sourceCounters = new Map<string, number>()
  const targetCounters = new Map<string, number>()
  const pairCounters = new Map<string, number>()

  const sortedCircuits = [...data.circuits].sort((a, b) => {
    if (a.originId !== b.originId) return a.originId.localeCompare(b.originId)
    if (a.lineType !== b.lineType)
      return a.lineType === 'normal' ? -1 : 1
    return a.destinationId.localeCompare(b.destinationId)
  })

  const edges: Edge<CircuitEdgeData>[] = sortedCircuits.map((circuit) => {
    const isAlt = circuit.lineType === 'alternativa'
    const protectionState = protectionStatus[circuit.id]
    const stroke = isAlt ? LINE_COLORS.alternativa : LINE_COLORS.normal

    const srcKey = circuit.originId
    const tgtKey = circuit.destinationId
    const pairKey = `${srcKey}→${tgtKey}`
    const srcIdx = sourceCounters.get(srcKey) ?? 0
    sourceCounters.set(srcKey, srcIdx + 1)
    const tgtIdx = targetCounters.get(tgtKey) ?? 0
    targetCounters.set(tgtKey, tgtIdx + 1)
    const pairIdx = pairCounters.get(pairKey) ?? 0
    pairCounters.set(pairKey, pairIdx + 1)

    // Desplazamiento lateral para que smoothstep no se superponga
    const offset = (pairIdx - 0.5) * 22 + (isAlt ? 14 : -14) + (srcIdx % 5) * 6

    return {
      id: circuit.id,
      source: circuit.originId,
      target: circuit.destinationId,
      sourceHandle: isAlt ? 'out-alt' : 'out-normal',
      targetHandle: isAlt ? 'in-alt' : 'in-normal',
      type: 'smoothstep',
      pathOptions: {
        offset,
        borderRadius: 12,
      },
      animated: false,
      // Etiquetas solo en selección (evitan el solape visual)
      label: undefined,
      data: { circuit, protectionState },
      className: [
        isAlt ? 'edge-alternativa' : 'edge-normal',
        protectionState ? `edge-prot-${protectionState}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      style: {
        stroke,
        strokeWidth: isAlt ? 2 : 2.5,
        strokeDasharray: undefined,
        opacity: 0.92,
      },
      zIndex: isAlt ? 1 : 2,
    }
  })

  return { nodes: layoutNodes(nodes, edges, data), edges }
}

function layoutNodes(
  nodes: Node<EquipmentNodeData>[],
  edges: Edge[],
  data: DistributionData,
): Node<EquipmentNodeData>[] {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    align: 'UL',
    nodesep: 72,
    ranksep: 150,
    edgesep: 40,
    marginx: 60,
    marginy: 60,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Preferir aristas normales en el layout; las alternativas pesan menos
  let edgeSeq = 0
  for (const edge of edges) {
    const circuit = (edge.data as CircuitEdgeData | undefined)?.circuit
    const isAlt = circuit?.lineType === 'alternativa'
    g.setEdge(edge.source, edge.target, {
      weight: isAlt ? 1 : 4,
      minlen: isAlt ? 2 : 1,
    }, `e${edgeSeq++}`)
  }

  dagre.layout(g)

  // Separar visualmente cuadros N-1 (izquierda) y N-2 (derecha)
  const SHIFT = 520
  const laid = nodes.map((node) => {
    const pos = g.node(node.id)
    const eq = node.data.equipment
    let xShift = 0
    if (/MSB-6PWS0001|PNL-MSB10|SDG-GENS000[12]/.test(eq.id)) xShift = -SHIFT
    else if (/MSB-6PWS0002|PNL-MSB20|SDG-GENS000[34]/.test(eq.id)) xShift = SHIFT
    else {
      // Empujar cargas según su alimentación dominante
      const inns = data.circuits.filter((c) => c.destinationId === eq.id)
      const fromN1 = inns.some((c) => /MSB10|MSB-6PWS0001|GENS000[12]/.test(c.originId))
      const fromN2 = inns.some((c) => /MSB20|MSB-6PWS0002|GENS000[34]/.test(c.originId))
      if (fromN1 && !fromN2) xShift = -SHIFT * 0.55
      else if (fromN2 && !fromN1) xShift = SHIFT * 0.55
    }

    const rank = KIND_RANK[eq.kind]
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2 + xShift,
        y: pos.y - NODE_HEIGHT / 2 + rank * 8,
      },
    }
  })

  return laid.sort(
    (a, b) =>
      KIND_RANK[a.data.equipment.kind] - KIND_RANK[b.data.equipment.kind],
  )
}
