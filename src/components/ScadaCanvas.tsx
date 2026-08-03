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
  Circuit,
  ProtectionStatusEntry,
  ProtectionStatusMap,
  Selection,
} from '../types'
import {
  buildGraph,
  layoutSubtree,
  LINE_COLORS,
  type CircuitEdgeData,
  type EquipmentNodeData,
} from '../utils/graphBuilder'
import { findEquipmentByQuery, getUpstreamTrace } from '../utils/upstream'
import { CircuitBalloon } from './CircuitBalloon'
import { DetailPanel } from './DetailPanel'
import { EquipmentNode } from './EquipmentNode'

const nodeTypes = { equipment: EquipmentNode }

const emptyStatus: ProtectionStatusMap = {}

interface BalloonState {
  circuit: Circuit
  x: number
  y: number
}

function ScadaCanvasInner() {
  const { fitView } = useReactFlow()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatusMap>(() =>
      toProtectionStatusMap(sampleProtectionStatus),
    )
  const [statusSource, setStatusSource] = useState('todos abiertos')

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
  const [balloon, setBalloon] = useState<BalloonState | null>(null)
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

  const runSearch = useCallback((rawQuery: string) => {
    const found = findEquipmentByQuery(system690.equipment, rawQuery)
    if (!found) {
      setSearchError('No se encontró ningún equipo con ese nombre o ID.')
      setHighlight(null)
      setSelection(null)
      setBalloon(null)
      return
    }

    const trace = getUpstreamTrace(found.id, system690.circuits)
    setSearchError(null)
    setBalloon(null)
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
  }, [])

  const displayNodes = useMemo((): Node<EquipmentNodeData>[] => {
    if (!highlight) {
      return nodes.map((node) => ({
        ...node,
        data: { ...node.data, highlight: undefined },
        selected: false,
      }))
    }

    const scoped = nodes.filter((n) => highlight.equipmentIds.has(n.id))
    const scopedEdges = edges.filter((e) => highlight.circuitIds.has(e.id))
    const compacted = layoutSubtree(scoped, scopedEdges)

    return compacted.map((node) => ({
      ...node,
      data: {
        ...node.data,
        highlight:
          node.id === highlight.targetId
            ? ('target' as const)
            : ('upstream' as const),
      },
      selected: node.id === highlight.targetId,
    }))
  }, [nodes, edges, highlight])

  const displayEdges = useMemo(() => {
    return edges
      .filter((e) => {
        const circuit = (e.data as CircuitEdgeData | undefined)?.circuit
        if (!circuit) return true
        if (highlight && !highlight.circuitIds.has(e.id)) return false
        if (circuit.lineType === 'alternativa' && !showAlt) return false
        if (circuit.lineType === 'normal' && !showNormal) return false
        return true
      })
      .map((edge) => {
        const circuit = (edge.data as CircuitEdgeData)?.circuit
        const isAlt = circuit?.lineType === 'alternativa'
        const baseStroke = isAlt
          ? LINE_COLORS.alternativa
          : LINE_COLORS.normal
        const selected = balloon?.circuit.id === edge.id

        return {
          ...edge,
          label: highlight
            ? circuit?.protectionName
            : selected
              ? circuit?.protectionName
              : undefined,
          labelStyle: {
            fill: selected ? '#fff' : '#c8d4d0',
            fontSize: highlight ? 10 : 11,
            fontWeight: 600,
          },
          labelBgStyle: {
            fill: selected ? '#2a3a36' : '#1a2422',
            fillOpacity: 0.92,
          },
          labelBgPadding: [3, 5] as [number, number],
          labelBgBorderRadius: 4,
          style: {
            ...edge.style,
            stroke: baseStroke,
            strokeWidth: selected ? 3.5 : isAlt ? 2.25 : 2.75,
            opacity: 0.95,
            strokeDasharray: undefined,
          },
          animated: false,
          zIndex: selected ? 20 : isAlt ? 1 : 2,
        }
      })
  }, [edges, showAlt, showNormal, highlight, balloon])

  useEffect(() => {
    if (!highlight) return
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 400, maxZoom: 1.5 })
    }, 80)
    return () => window.clearTimeout(t)
  }, [highlight, displayNodes, fitView])

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
    applyStatusEntries(sampleProtectionStatus, 'todos abiertos')
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

  const placeBalloon = useCallback((circuit: Circuit, event: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const localX = rect ? event.clientX - rect.left : event.clientX
    const localY = rect ? event.clientY - rect.top : event.clientY
    const balloonW = 280
    const balloonH = 320
    const maxX = (rect?.width ?? window.innerWidth) - balloonW - 12
    const maxY = (rect?.height ?? window.innerHeight) - balloonH - 12
    setBalloon({
      circuit,
      x: Math.max(12, Math.min(localX + 14, maxX)),
      y: Math.max(12, Math.min(localY + 14, maxY)),
    })
  }, [])

  const handleNodeClick = useCallback((_: MouseEvent, node: Node) => {
    const equipment = (node.data as EquipmentNodeData).equipment
    const circuits = system690.circuits.filter(
      (c) => c.originId === equipment.id || c.destinationId === equipment.id,
    )
    setSearchError(null)
    setBalloon(null)
    setSelection({ type: 'equipment', item: equipment, circuits })
  }, [])

  const handleEdgeClick = useCallback(
    (event: MouseEvent, edge: Edge) => {
      const circuit = (edge.data as CircuitEdgeData | undefined)?.circuit
      if (!circuit) return
      event.stopPropagation()
      setSearchError(null)
      setSelection({ type: 'circuit', item: circuit })
      placeBalloon(circuit, event)
    },
    [placeBalloon],
  )

  const handlePaneClick = useCallback(() => {
    setBalloon(null)
    if (!highlight) setSelection(null)
  }, [highlight])

  const clearSearchView = useCallback(() => {
    clearHighlight()
    setSelection(null)
    setBalloon(null)
    setSearchQuery('')
    requestAnimationFrame(() => {
      void fitView({ padding: 0.15, duration: 400 })
    })
  }, [clearHighlight, fitView])

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
              <button type="button" className="btn" onClick={clearSearchView}>
                Ver todo
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
            <button type="button" className="btn" onClick={handleClearStatus}>
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
        <div className="canvas-wrap" ref={canvasRef}>
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

          {balloon && (
            <CircuitBalloon
              circuit={balloon.circuit}
              state={protectionStatus[balloon.circuit.id]}
              x={balloon.x}
              y={balloon.y}
              onClose={() => setBalloon(null)}
            />
          )}
        </div>
        <DetailPanel
          selection={selection}
          protectionStatus={protectionStatus}
          onClose={() => {
            setBalloon(null)
            if (highlight) {
              const target = system690.equipment.find(
                (e) => e.id === highlight.targetId,
              )
              if (target) {
                setSelection({
                  type: 'search',
                  item: target,
                  upstreamCircuits: system690.circuits.filter((c) =>
                    highlight.circuitIds.has(c.id),
                  ),
                  upstreamEquipmentIds: [...highlight.equipmentIds],
                })
                return
              }
            }
            setSelection(null)
          }}
        />
      </main>

      <footer className="statusbar">
        <span>
          {highlight
            ? `Árbol de ${highlight.targetId}: ${highlight.equipmentIds.size} equipos · ${highlight.circuitIds.size} circuitos`
            : `${system690.equipment.length} equipos · ${system690.circuits.length} circuitos`}
          {' · '}protecciones:{' '}
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
