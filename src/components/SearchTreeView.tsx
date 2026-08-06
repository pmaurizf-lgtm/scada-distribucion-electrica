import { useMemo, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import { lineBadge } from '../utils/cascadeModel'
import type { UpstreamTrace } from '../utils/upstream'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'

interface SearchTreeViewProps {
  equipmentId: string
  trace: UpstreamTrace
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
}

function eqById(id: string): Equipment | undefined {
  return system690.equipment.find((e) => e.id === id)
}

/** Aristas aguas arriba: preferir circuitos reales; si no hay, virtuales de barra */
function upstreamEdges(equipmentId: string): Circuit[] {
  const all = system690.circuits.filter((c) => c.destinationId === equipmentId)
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
}: {
  circuit: Circuit
  state?: ProtectionState
  locked?: boolean
  flowing?: boolean
  onClick: (e: ReactMouseEvent) => void
}) {
  return (
    <button
      type="button"
      className={`casc-brk casc-brk--compact${state ? ` casc-brk--${state}` : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}`}
      data-circuit-id={circuit.id}
      onClick={onClick}
      title={`${circuit.protectionName} · ${circuit.lineType}`}
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
  return (
    <div
      className={`stree-eq${live ? ' stree-eq--live' : ''}${highlight ? ' stree-eq--target' : ''}`}
      data-equip={equipment.id}
    >
      <span className="stree-eq__sym">{symbolFor(equipment.kind)}</span>
      <strong className="stree-eq__id">{equipment.id}</strong>
      {equipment.dcp10Id && (
        <span className="stree-eq__dcp">{equipment.dcp10Id}</span>
      )}
      <span className="stree-eq__name">{equipment.name}</span>
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
}: {
  equipmentId: string
  isTarget?: boolean
  visited: Set<string>
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
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
      className={`stree-node${isTarget ? ' stree-node--target' : ''}${dual ? ' stree-node--dual' : ''}`}
    >
      {feeds.length > 0 && (
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
                />
                <div className="stree-branch__wire" aria-hidden />
                {!feed.virtual ? (
                  <>
                    <BreakerMini
                      circuit={feed}
                      state={protectionStatus[feed.id]}
                      locked={lockedCircuits.has(feed.id)}
                      flowing={energizedCircuitIds.has(feed.id)}
                      onClick={(e) => onBreaker(feed, e)}
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
                <div className="stree-branch__wire stree-branch__wire--short" aria-hidden />
              </div>
            )
          })}
        </div>
      )}

      {dual && <div className="stree-join" aria-hidden />}

      <div className="stree-node__self">
        {!dual && feeds.length === 1 && (
          <div
            className={`stree-branch__wire stree-branch__wire--into${
              feeds[0].lineType === 'alternativa' ? ' stree-branch__wire--alt' : ''
            }`}
            aria-hidden
          />
        )}
        {dual && <div className="stree-branch__wire stree-branch__wire--into" aria-hidden />}
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

  return (
    <div className="stree">
      <header className="stree__head">
        <h3>Árbol de alimentaciones · {equipmentId}</h3>
        <p>
          El equipo aparece una sola vez. Arriba, rutas aguas arriba
          {direct.length > 1
            ? ` (${direct.length} alimentaciones NORM/ALT convergentes)`
            : ''}
          . {trace.circuits.filter((c) => !c.virtual).length} circuitos reales
          en la traza.
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
        />
      </div>
    </div>
  )
}
