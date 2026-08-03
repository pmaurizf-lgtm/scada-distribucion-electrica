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
const NODE_HEIGHT = 72

/** Cerrada = energizada (rojo); abierta = desenergizada (verde) */
export const PROTECTION_COLORS: Record<ProtectionState, string> = {
  cerrada: '#d64545',
  abierta: '#3cb371',
}

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

  const edges: Edge<CircuitEdgeData>[] = data.circuits.map((circuit) => {
    const isAlt = circuit.lineType === 'alternativa'
    const protectionState = protectionStatus[circuit.id]
    const stroke = protectionState
      ? PROTECTION_COLORS[protectionState]
      : isAlt
        ? '#d4a017'
        : '#3d9b8f'

    return {
      id: circuit.id,
      source: circuit.originId,
      target: circuit.destinationId,
      type: 'smoothstep',
      animated: protectionState ? protectionState === 'cerrada' : !isAlt,
      label: `${circuit.protectionName} · ${circuit.protectionCurrentA} A`,
      data: { circuit, protectionState },
      className: [
        isAlt ? 'edge-alternativa' : 'edge-normal',
        protectionState ? `edge-prot-${protectionState}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      style: {
        stroke,
        strokeWidth: protectionState === 'cerrada' ? 3 : 2.5,
        strokeDasharray: isAlt ? '8 5' : undefined,
        opacity: 1,
      },
      labelStyle: {
        fill: '#c8d4d0',
        fontSize: 10,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: '#1a2422',
        fillOpacity: 0.9,
      },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 4,
    }
  })

  return { nodes: layoutNodes(nodes, edges), edges }
}

function layoutNodes(
  nodes: Node<EquipmentNodeData>[],
  edges: Edge[],
): Node<EquipmentNodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',
    nodesep: 48,
    ranksep: 90,
    marginx: 40,
    marginy: 40,
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes
    .map((node) => {
      const pos = g.node(node.id)
      const rank = KIND_RANK[node.data.equipment.kind]
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2 + rank * 4,
        },
      }
    })
    .sort(
      (a, b) =>
        KIND_RANK[a.data.equipment.kind] - KIND_RANK[b.data.equipment.kind],
    )
}
