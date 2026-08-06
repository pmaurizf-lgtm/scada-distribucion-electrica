import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import { incomingFeeds, lineBadge } from '../utils/cascadeModel'
import type { UpstreamTrace } from '../utils/upstream'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
import { CircuitBalloon } from './CircuitBalloon'
import { EquipmentBalloon } from './EquipmentBalloon'

interface SearchTreeViewProps {
  equipmentId: string
  trace: UpstreamTrace
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
}

const HOVER_DELAY_MS = 1800

function eqById(id: string): Equipment | undefined {
  return system690.equipment.find((e) => e.id === id)
}

/** Nodos del cuadro principal (tope del árbol de búsqueda) */
function isMainBoardNode(id: string): boolean {
  if (/^PNL-MSB/i.test(id) || /^MSB-6PWS/i.test(id)) return true
  const eq = eqById(id)
  return eq?.kind === 'cuadro_principal' || eq?.kind === 'generador'
}

/** Origen por encima del cuadro (generadores / QG*) */
function isGeneratorSide(circuit: Circuit): boolean {
  if (/^QG/i.test(circuit.protectionName)) return true
  if (circuit.originId.startsWith('SDG-')) return true
  return eqById(circuit.originId)?.kind === 'generador'
}

/**
 * Aristas aguas arriba hasta el cuadro principal (paneles MSB).
 * No incluye generadores ni interruptores QG*.
 */
function upstreamEdges(equipmentId: string): Circuit[] {
  if (isMainBoardNode(equipmentId)) return []

  const all = system690.circuits.filter(
    (c) => c.destinationId === equipmentId && !isGeneratorSide(c),
  )
  const real = all
    .filter((c) => !c.virtual)
    .sort((a, b) => {
      if (a.lineType === b.lineType) {
        return a.protectionName.localeCompare(b.protectionName, undefined, {
          numeric: true,
        })
      }
      return a.lineType === 'normal' ? -1 : 1
    })
  if (real.length > 0) return real
  return all.filter((c) => c.virtual)
}

function BreakerMini({
  circuit,
  state,
  locked,
  flowing,
  onClick,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  circuit: Circuit
  state?: ProtectionState
  locked?: boolean
  flowing?: boolean
  onClick: (e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const hoverTimer = useRef<number | null>(null)

  const clearHoverTimer = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  useEffect(() => () => clearHoverTimer(), [])

  return (
    <button
      type="button"
      className={`casc-brk casc-brk--compact${state ? ` casc-brk--${state}` : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}`}
      data-circuit-id={circuit.id}
      onClick={onClick}
      title={`${circuit.protectionName} · ${circuit.lineType} · mantén el puntero para ver detalles`}
      onMouseEnter={(e) => {
        if (!onHoverInfo) return
        clearHoverTimer()
        const el = e.currentTarget
        hoverTimer.current = window.setTimeout(() => {
          onHoverInfo(circuit, el.getBoundingClientRect())
        }, HOVER_DELAY_MS)
      }}
      onMouseLeave={() => {
        clearHoverTimer()
        onHoverInfoEnd?.()
      }}
    >
      <span className="casc-brk__sym">
        <MotorizedBreakerSymbol state={state} />
      </span>
      {locked && <LockBadge />}
      <span className="casc-brk__name">{circuit.protectionName}</span>
    </button>
  )
}

function EquipCard({
  equipment,
  live,
  highlight,
}: {
  equipment: Equipment
  live?: boolean
  highlight?: boolean
}) {
  const [eqHover, setEqHover] = useState(false)
  const [showEqBalloon, setShowEqBalloon] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const feedSummaries = useMemo(() => {
    return incomingFeeds(system690, equipment.id).map((f) => ({
      name: f.protectionName,
      lineType: f.lineType,
      originId: f.originId,
    }))
  }, [equipment.id])

  useEffect(() => {
    if (!eqHover) {
      setShowEqBalloon(false)
      return
    }
    const t = window.setTimeout(() => setShowEqBalloon(true), HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [eqHover])

  return (
    <div
      ref={wrapRef}
      className={`stree-eq${live ? ' stree-eq--live' : ''}${highlight ? ' stree-eq--target' : ''}`}
      data-equip={equipment.id}
      onMouseEnter={() => setEqHover(true)}
      onMouseLeave={() => setEqHover(false)}
    >
      <span className="stree-eq__sym">{symbolFor(equipment.kind)}</span>
      <strong className="stree-eq__id">{equipment.id}</strong>
      {equipment.dcp10Id && (
        <span className="stree-eq__dcp">{equipment.dcp10Id}</span>
      )}
      <span className="stree-eq__name">{equipment.name}</span>
      {showEqBalloon && (
        <EquipmentBalloon
          equipment={equipment}
          feeds={feedSummaries}
          anchorRef={wrapRef}
        />
      )}
    </div>
  )
}

function symbolFor(kind: Equipment['kind']): ReactNode {
  switch (kind) {
    case 'generador':
      return 'G'
    case 'conversion':
      return 'T'
    case 'cuadro_principal':
      return '▣'
    case 'cuadro_secundario':
      return '▦'
    default:
      return 'M'
  }
}

/**
 * Nodo del árbol: padres (aguas arriba) arriba, este equipo abajo.
 * Cada equipo se pinta una sola vez en su posición del árbol.
 */
function TreeNode({
  equipmentId,
  isTarget,
  visited,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  equipmentId: string
  isTarget?: boolean
  visited: Set<string>
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const equipment = eqById(equipmentId)
  const feeds = useMemo(() => upstreamEdges(equipmentId), [equipmentId])

  if (!equipment) return null

  // Evitar ciclos en enlaces de barra / bucles
  if (visited.has(equipmentId) && !isTarget) {
    return (
      <div className="stree-eq stree-eq--ref" title="Ya representado aguas arriba">
        <span className="stree-eq__id">{equipmentId}</span>
      </div>
    )
  }

  const nextVisited = new Set(visited)
  nextVisited.add(equipmentId)

  const dual = feeds.length > 1

  return (
    <div
      className={`stree-node${isTarget ? ' stree-node--target' : ''}${dual ? ' stree-node--dual' : ''}${feeds.length === 1 ? ' stree-node--single' : ''}`}
    >
      {feeds.length > 0 && (
        <div
          className={`stree-feed${dual ? ' stree-feed--dual' : ' stree-feed--single'}`}
        >
          <div className="stree-node__parents">
            {feeds.map((feed) => {
              const isAlt = feed.lineType === 'alternativa'
              return (
                <div
                  key={feed.id}
                  className={`stree-branch${isAlt ? ' stree-branch--alt' : ' stree-branch--norm'}`}
                >
                  <TreeNode
                    equipmentId={feed.originId}
                    visited={nextVisited}
                    protectionStatus={protectionStatus}
                    lockedCircuits={lockedCircuits}
                    energizedCircuitIds={energizedCircuitIds}
                    energizedEquipmentIds={energizedEquipmentIds}
                    onBreaker={onBreaker}
                    onHoverInfo={onHoverInfo}
                    onHoverInfoEnd={onHoverInfoEnd}
                  />
                  <div className="stree-branch__leg">
                    <div className="stree-branch__wire" aria-hidden />
                    {!feed.virtual ? (
                      <>
                        <BreakerMini
                          circuit={feed}
                          state={protectionStatus[feed.id]}
                          locked={lockedCircuits.has(feed.id)}
                          flowing={energizedCircuitIds.has(feed.id)}
                          onClick={(e) => onBreaker(feed, e)}
                          onHoverInfo={onHoverInfo}
                          onHoverInfoEnd={onHoverInfoEnd}
                        />
                        <span
                          className={`stree-branch__tag${isAlt ? ' stree-branch__tag--alt' : ''}`}
                        >
                          {lineBadge(feed.lineType)}
                        </span>
                      </>
                    ) : (
                      <span className="stree-branch__bus" title="Enlace de barra">
                        barra
                      </span>
                    )}
                    <div
                      className={`stree-branch__wire stree-branch__wire--foot${
                        isAlt ? ' stree-branch__wire--alt' : ''
                      }`}
                      aria-hidden
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {dual && (
            <>
              <div className="stree-join" aria-hidden />
              <div className="stree-branch__wire stree-branch__wire--stem" aria-hidden />
            </>
          )}
        </div>
      )}

      <div className="stree-node__self">
        <EquipCard
          equipment={equipment}
          live={energizedEquipmentIds.has(equipment.id)}
          highlight={isTarget}
        />
      </div>
    </div>
  )
}

export function SearchTreeView({
  equipmentId,
  trace,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
}: SearchTreeViewProps) {
  const direct = upstreamEdges(equipmentId).filter((c) => !c.virtual)
  const realInTrace = trace.circuits.filter(
    (c) => !c.virtual && !isGeneratorSide(c),
  ).length

  const [brkBalloon, setBrkBalloon] = useState<{
    circuit: Circuit
    left: number
    top: number
  } | null>(null)

  const showBreakerInfo = (circuit: Circuit, rect: DOMRect) => {
    setBrkBalloon({
      circuit,
      left: rect.right + 8,
      top: Math.max(8, rect.top),
    })
  }

  return (
    <div className="stree">
      <header className="stree__head">
        <h3>Árbol de alimentaciones · {equipmentId}</h3>
        <p>
          Del cuadro principal hacia abajo (sin generadores ni QG*). El equipo
          aparece una sola vez
          {direct.length > 1
            ? ` · ${direct.length} alimentaciones NORM/ALT convergentes`
            : ''}
          . {realInTrace} circuitos reales en la traza.
        </p>
      </header>

      <div className="stree__canvas">
        <TreeNode
          equipmentId={equipmentId}
          isTarget
          visited={new Set()}
          protectionStatus={protectionStatus}
          lockedCircuits={lockedCircuits}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          onBreaker={onBreaker}
          onHoverInfo={showBreakerInfo}
          onHoverInfoEnd={() => setBrkBalloon(null)}
        />
      </div>

      {brkBalloon && (
        <CircuitBalloon
          circuit={brkBalloon.circuit}
          state={protectionStatus[brkBalloon.circuit.id]}
          x={brkBalloon.left}
          y={brkBalloon.top}
          fixed
          onClose={() => setBrkBalloon(null)}
        />
      )}
    </div>
  )
}
