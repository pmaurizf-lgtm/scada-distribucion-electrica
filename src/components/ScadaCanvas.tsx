import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { system690 } from '../data/system690'
import {
  sampleProtectionStatus,
  toProtectionStatusMap,
} from '../data/sampleProtectionStatus'
import type {
  ProtectionState,
  ProtectionStatusEntry,
  ProtectionStatusMap,
  Selection,
} from '../types'
import {
  buildGraph,
  PROTECTION_COLORS,
  type CircuitEdgeData,
  type EquipmentNodeData,
} from '../utils/graphBuilder'
import { findEquipmentByQuery, getUpstreamTrace } from '../utils/upstream'
import { DetailPanel } from './DetailPanel'
import { EquipmentNode } from './EquipmentNode'

const nodeTypes = { equipment: EquipmentNode }

const emptyStatus: ProtectionStatusMap = {}

function ScadaCanvasInner() {
  const { fitView, setCenter, getNode } = useReactFlow()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatusMap>(() =>
      toProtectionStatusMap(sampleProtectionStatus),
    )
  const [statusSource, setStatusSource] = useState('simulación de ejemplo')

  const graph = useMemo(
    () => buildGraph(system690, protectionStatus),
    [protectionStatus],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  const [selection, setSelection] = useState<Selection>(null)
  const [showAlt, setShowAlt] = useState(true)
  const [showNormal, setShowNormal] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<{
    targetId: string
    equipmentIds: Set<string>
    circuitIds: Set<string>
  } | null>(null)

  const clearHighlight = useCallback(() => {
    setHighlight(null)
    setSearchError(null)
  }, [])

  const focusEquipment = useCallback(
    (equipmentId: string) => {
      requestAnimationFrame(() => {
        const node = getNode(equipmentId)
        if (!node) {
          void fitView({ padding: 0.2, duration: 400 })
          return
        }
        const w = node.measured?.width ?? 200
        const h = node.measured?.height ?? 72
        setCenter(node.position.x + w / 2, node.position.y + h / 2, {
          zoom: 1.15,
          duration: 500,
        })
      })
    },
    [fitView, getNode, setCenter],
  )

  const runSearch = useCallback(
    (rawQuery: string) => {
      const found = findEquipmentByQuery(
        system690.equipment,
        rawQuery,
      )
      if (!found) {
        setSearchError('No se encontró ningún equipo con ese nombre o ID.')
        setHighlight(null)
        setSelection(null)
        return
      }

      const trace = getUpstreamTrace(found.id, system690.circuits)
      setSearchError(null)
      setHighlight({
        targetId: found.id,
        equipmentIds: new Set(trace.equipmentIds),
        circuitIds: new Set(trace.circuitIds),
      })
      setSelection({
        type: 'search',
        item: found,
        upstreamCircuits: trace.circuits,
        upstreamEquipmentIds: trace.equipmentIds,
      })
      focusEquipment(found.id)
    },
    [focusEquipment],
  )

  const handleSearchSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      runSearch(searchQuery)
    },
    [runSearch, searchQuery],
  )

  const applyStatusEntries = useCallback(
    (entries: ProtectionStatusEntry[], source: string) => {
      setProtectionStatus(toProtectionStatusMap(entries))
      setStatusSource(source)
    },
    [],
  )

  const handleLoadSimulated = useCallback(() => {
    applyStatusEntries(sampleProtectionStatus, 'simulación de ejemplo')
  }, [applyStatusEntries])

  const handleClearStatus = useCallback(() => {
    setProtectionStatus(emptyStatus)
    setStatusSource('sin estado de protecciones')
  }, [])

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as ProtectionStatusEntry[]
        if (!Array.isArray(parsed)) {
          throw new Error('El JSON debe ser un array')
        }
        const valid = parsed.filter(
          (row) =>
            row &&
            typeof row.circuitId === 'string' &&
            (row.state === 'cerrada' || row.state === 'abierta'),
        )
        if (valid.length === 0) {
          throw new Error('Sin entradas válidas')
        }
        applyStatusEntries(valid, `archivo: ${file.name}`)
      } catch {
        setSearchError(
          'No se pudo leer el archivo. Usa JSON [{ circuitId, state: "cerrada"|"abierta" }].',
        )
      }
      e.target.value = ''
    },
    [applyStatusEntries],
  )

  const displayNodes = useMemo(() => {
    return nodes.map((node) => {
      let nodeHighlight: EquipmentNodeData['highlight']
      if (highlight) {
        if (node.id === highlight.targetId) nodeHighlight = 'target'
        else if (highlight.equipmentIds.has(node.id))
          nodeHighlight = 'upstream'
        else nodeHighlight = 'dim'
      }
      return {
        ...node,
        data: { ...node.data, highlight: nodeHighlight },
        selected: node.id === highlight?.targetId,
      }
    })
  }, [nodes, highlight])

  const displayEdges = useMemo(() => {
    return edges
      .filter((e) => {
        const circuit = (e.data as CircuitEdgeData | undefined)?.circuit
        if (!circuit) return true
        if (circuit.lineType === 'alternativa' && !showAlt) return false
        if (circuit.lineType === 'normal' && !showNormal) return false
        return true
      })
      .map((edge) => {
        const circuit = (edge.data as CircuitEdgeData)?.circuit
        const protectionState = (edge.data as CircuitEdgeData)
          ?.protectionState as ProtectionState | undefined
        const isAlt = circuit?.lineType === 'alternativa'
        const baseStroke = protectionState
          ? PROTECTION_COLORS[protectionState]
          : isAlt
            ? '#d4a017'
            : '#3d9b8f'

        let opacity = 1
        let strokeWidth = protectionState === 'cerrada' ? 3 : 2.5
        if (highlight) {
          if (highlight.circuitIds.has(edge.id)) {
            strokeWidth = 4
            opacity = 1
          } else {
            opacity = 0.18
          }
        }

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: baseStroke,
            strokeWidth,
            opacity,
          },
          animated: highlight
            ? highlight.circuitIds.has(edge.id) &&
              protectionState !== 'abierta'
            : protectionState
              ? protectionState === 'cerrada'
              : !isAlt,
          zIndex: highlight?.circuitIds.has(edge.id) ? 10 : 0,
        }
      })
  }, [edges, showAlt, showNormal, highlight])

  const handleNodeClick = useCallback((_: MouseEvent, node: Node) => {
    const equipment = (node.data as EquipmentNodeData).equipment
    const circuits = system690.circuits.filter(
      (c) => c.originId === equipment.id || c.destinationId === equipment.id,
    )
    setHighlight(null)
    setSearchError(null)
    setSelection({ type: 'equipment', item: equipment, circuits })
  }, [])

  const handleEdgeClick = useCallback((_: MouseEvent, edge: Edge) => {
    const circuit = (edge.data as CircuitEdgeData | undefined)?.circuit
    if (circuit) {
      setHighlight(null)
      setSearchError(null)
      setSelection({ type: 'circuit', item: circuit })
    }
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelection(null)
    clearHighlight()
  }, [clearHighlight])

  const closedCount = Object.values(protectionStatus).filter(
    (s) => s === 'cerrada',
  ).length
  const openCount = Object.values(protectionStatus).filter(
    (s) => s === 'abierta',
  ).length

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden />
          <div>
            <h1>{system690.title}</h1>
            <p>{system690.vessel}</p>
          </div>
        </div>
        <div className="topbar__controls">
          <form className="search" onSubmit={handleSearchSubmit}>
            <label>
              <span className="sr-only">Buscar equipo</span>
              <input
                type="search"
                placeholder="Nombre o ID del equipo…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchError(null)
                }}
                list="equipment-suggestions"
              />
            </label>
            <datalist id="equipment-suggestions">
              {system690.equipment.map((eq) => (
                <option key={eq.id} value={eq.name} />
              ))}
            </datalist>
            <button type="submit" className="btn btn--primary">
              Buscar
            </button>
            {highlight && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearHighlight()
                  setSelection(null)
                  setSearchQuery('')
                }}
              >
                Limpiar
              </button>
            )}
          </form>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showNormal}
              onChange={(e) => setShowNormal(e.target.checked)}
            />
            <span className="legend-line legend-line--normal" />
            Normales
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showAlt}
              onChange={(e) => setShowAlt(e.target.checked)}
            />
            <span className="legend-line legend-line--alt" />
            Alternativas
          </label>

          <div className="status-actions">
            <button
              type="button"
              className="btn"
              onClick={handleLoadSimulated}
              title="Recarga el estado simulado de protecciones"
            >
              Simular estado
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              title="Cargar JSON de protecciones abiertas/cerradas"
            >
              Cargar archivo
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleClearStatus}
            >
              Quitar estados
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </header>

      {searchError && <div className="banner banner--error">{searchError}</div>}

      <main className="workspace">
        <div className="canvas-wrap">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.25}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#2a3a36" gap={22} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                if (highlight?.targetId === n.id) return '#e8c547'
                if (highlight?.equipmentIds.has(n.id)) return '#3d9b8f'
                const kind = (n.data as EquipmentNodeData)?.equipment?.kind
                switch (kind) {
                  case 'generador':
                    return '#2f6f5e'
                  case 'conversion':
                    return '#3a5f7a'
                  case 'cuadro_principal':
                    return '#4a6b3d'
                  case 'cuadro_secundario':
                    return '#5a6a3a'
                  default:
                    return '#6a5a3a'
                }
              }}
              maskColor="rgba(8, 14, 12, 0.7)"
            />
          </ReactFlow>
        </div>
        <DetailPanel
          selection={selection}
          protectionStatus={protectionStatus}
          onClose={() => {
            setSelection(null)
            clearHighlight()
          }}
        />
      </main>

      <footer className="statusbar">
        <span>
          {system690.equipment.length} equipos ·{' '}
          {system690.circuits.length} circuitos · protecciones:{' '}
          <span className="swatch swatch--cerrada" /> {closedCount} cerradas ·{' '}
          <span className="swatch swatch--abierta" /> {openCount} abiertas ·{' '}
          {statusSource}
        </span>
        <span>Boceto · GitHub Pages · sin backend</span>
      </footer>
    </div>
  )
}

export function ScadaCanvas() {
  return (
    <ReactFlowProvider>
      <ScadaCanvasInner />
    </ReactFlowProvider>
  )
}
