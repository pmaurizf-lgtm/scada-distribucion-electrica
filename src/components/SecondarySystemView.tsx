/**
 * Planta unifilar de sistemas secundarios (115 V / 400 Hz).
 * Misma UX de globos / expandir que la cascada 690, sin tocar plant-msb.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, ProtectionState } from '../types'
import { hasSsbBoardLayout } from '../abtDownstream/ssbBoard'
import {
  boardHasInterior,
  chainsForTab,
  type SystemTabId,
} from '../voltageSystems/model'
import { nestableChildFeeders } from '../utils/cascadeModel'
import { BreakerChip } from './BreakerChip'
import { CircuitBalloon, placeCircuitBalloon } from './CircuitBalloon'
import { EquipmentBusDrop, equipFamOf, symbolFor } from './EquipmentBusDrop'
import { SsbBoardView } from './SsbBoardView'

export type SecondarySystemViewHandle = {
  expandAll: () => void
  collapseAll: () => void
}

type Props = {
  tab: Exclude<SystemTabId, '690'>
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  zoom: number
  onZoomChange: (z: number) => void
  locateEquipmentId?: string | null
  onToggleProtection: (circuitId: string) => boolean | void
  onJumpToCircuit?: (c: Circuit) => void
}

export const SecondarySystemView = forwardRef<
  SecondarySystemViewHandle,
  Props
>(function SecondarySystemView(
  {
    tab,
    protectionStatus,
    energizedCircuitIds,
    energizedEquipmentIds,
    lockedCircuits,
    zoom,
    onZoomChange,
    locateEquipmentId,
    onToggleProtection,
    onJumpToCircuit,
  },
  ref,
) {
  const chains = useMemo(() => chainsForTab(tab), [tab])
  const [expandedEquip, setExpandedEquip] = useState<Set<string>>(
    () => new Set(chains.map((c) => c.board.id)),
  )
  const [balloon, setBalloon] = useState<{
    circuit: Circuit
    x: number
    y: number
  } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setExpandedEquip(new Set(chains.map((c) => c.board.id)))
    setBalloon(null)
  }, [tab, chains])

  const toggleEquip = useCallback((id: string) => {
    setExpandedEquip((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      expandAll: () =>
        setExpandedEquip(new Set(chains.map((c) => c.board.id))),
      collapseAll: () => setExpandedEquip(new Set()),
    }),
    [chains],
  )

  const onLocalBreaker = useCallback(
    (c: Circuit, e: ReactMouseEvent) => {
      e.stopPropagation()
      onToggleProtection(c.id)
    },
    [onToggleProtection],
  )

  const showBalloonAt = useCallback((circuit: Circuit, rect: DOMRect) => {
    const { x, y } = placeCircuitBalloon(rect)
    setBalloon({ circuit, x, y })
  }, [])

  const hideBalloon = useCallback(() => setBalloon(null), [])

  // Zoom con rueda (mismo criterio que cascada)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return
      ev.preventDefault()
      const dir = ev.deltaY > 0 ? -1 : 1
      const next = Math.min(2.5, Math.max(0.25, zoom + dir * 0.1))
      onZoomChange(Math.round(next * 100) / 100)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, onZoomChange])

  const title =
    tab === '115' ? '115V Power System' : '400Hz Power System'
  const subtitle =
    tab === '115'
      ? `${chains.length} cuadros SSB-1PWS · TRF 440→115`
      : `${chains.length} cadenas SCV → MSB-4SFS · 400 Hz`

  return (
    <div className="casc casc--secondary" onClick={() => setBalloon(null)}>
      <div className="sys-plant__banner">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="casc__stage casc__stage--plant casc__stage--pan" ref={stageRef}>
        <div
          className="casc__pan sys-plant"
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <div className="sys-plant__rows">
            {chains.map(({ source, feed, board }) => {
              const expanded = expandedEquip.has(board.id)
              const feedFlow = energizedCircuitIds.has(feed.id)
              const boardLive = energizedEquipmentIds.has(board.id)
              const located = locateEquipmentId === board.id
              const canBoard =
                boardHasInterior(board) ||
                nestableChildFeeders(system690, board.id).length > 0

              return (
                <div
                  key={`${feed.id}-${board.id}`}
                  className={`sys-plant__chain${located ? ' sys-plant__chain--locate' : ''}`}
                  data-board={board.id}
                >
                  <div
                    className={`sys-plant__source hbus-drop__eq hbus-drop__eq--fam-${equipFamOf(source)}${energizedEquipmentIds.has(source.id) ? ' hbus-drop__eq--live' : ''}`}
                  >
                    <span className="hbus-drop__sym">
                      {symbolFor(source.kind)}
                    </span>
                    <span className="hbus-drop__id">{source.id}</span>
                    <span className="hbus-drop__name">{source.name}</span>
                  </div>

                  <div className="sys-plant__riser" aria-hidden>
                    <span
                      className={`sys-plant__wire${feedFlow ? ' sys-plant__wire--flow' : ''}`}
                    />
                    <BreakerChip
                      name={feed.protectionName}
                      state={protectionStatus[feed.id]}
                      compact
                      circuitId={feed.id}
                      circuit={feed}
                      flowing={feedFlow}
                      locked={lockedCircuits.has(feed.id)}
                      onClick={(e) => onLocalBreaker(feed, e)}
                      onHoverInfo={showBalloonAt}
                      onHoverInfoEnd={hideBalloon}
                    />
                    <span
                      className={`sys-plant__wire${feedFlow ? ' sys-plant__wire--flow' : ''}`}
                    />
                  </div>

                  {expanded && canBoard && hasSsbBoardLayout(board) ? (
                    <div
                      className={`equip-chassis equip-chassis--ssb${boardLive ? ' equip-chassis--live' : ''}${located ? ' equip-chassis--locate' : ''}`}
                      onDoubleClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleEquip(board.id)
                      }}
                      aria-label={`${board.id} · doble clic para plegar`}
                    >
                      <div className="equip-chassis__label">
                        <span className="equip-chassis__id">{board.id}</span>
                        <span className="equip-chassis__name">
                          {board.name}
                        </span>
                        <span className="equip-chassis__hint">
                          doble clic · plegar
                        </span>
                      </div>
                      <div className="equip-chassis__body">
                        <SsbBoardView
                          ssb={board}
                          feed={feed}
                          protectionStatus={protectionStatus}
                          energizedCircuitIds={energizedCircuitIds}
                          energizedEquipmentIds={energizedEquipmentIds}
                          lockedCircuits={lockedCircuits}
                          onLocalBreaker={onLocalBreaker}
                          onJumpToCircuit={onJumpToCircuit}
                          onHoverInfo={showBalloonAt}
                          onHoverInfoEnd={hideBalloon}
                          expandedEquip={expandedEquip}
                          onToggleEquip={toggleEquip}
                          locateEquipmentId={locateEquipmentId}
                        />
                      </div>
                    </div>
                  ) : (
                    <EquipmentBusDrop
                      circuit={feed}
                      equipment={board}
                      protectionStatus={protectionStatus}
                      energizedCircuitIds={energizedCircuitIds}
                      energizedEquipmentIds={energizedEquipmentIds}
                      lockedCircuits={lockedCircuits}
                      onLocalBreaker={onLocalBreaker}
                      onJumpToCircuit={onJumpToCircuit}
                      onHoverInfo={showBalloonAt}
                      onHoverInfoEnd={hideBalloon}
                      canExpand={canBoard}
                      expanded={expanded}
                      expandLabel={
                        expanded ? '▴ salidas' : '▾ salidas'
                      }
                      onToggleExpand={() => toggleEquip(board.id)}
                      equipFam={equipFamOf(board)}
                      located={located}
                      linkOnlyFromParent
                    >
                      {expanded && canBoard && (
                        <div className="hbus hbus--nested hbus--direct">
                          <div className="hbus__drops">
                            {nestableChildFeeders(system690, board.id)
                              .filter(
                                (x) =>
                                  !x.equipment.virtual &&
                                  !x.circuit.destinationId.startsWith('BUS-'),
                              )
                              .map(({ circuit, equipment }) => (
                                <div key={circuit.id} className="hbus__slot">
                                  <EquipmentBusDrop
                                    circuit={circuit}
                                    equipment={equipment}
                                    protectionStatus={protectionStatus}
                                    energizedCircuitIds={energizedCircuitIds}
                                    energizedEquipmentIds={
                                      energizedEquipmentIds
                                    }
                                    lockedCircuits={lockedCircuits}
                                    onLocalBreaker={onLocalBreaker}
                                    onJumpToCircuit={onJumpToCircuit}
                                    onHoverInfo={showBalloonAt}
                                    onHoverInfoEnd={hideBalloon}
                                    canExpand={
                                      nestableChildFeeders(
                                        system690,
                                        equipment.id,
                                      ).length > 0 ||
                                      hasSsbBoardLayout(equipment)
                                    }
                                    expanded={expandedEquip.has(equipment.id)}
                                    onToggleExpand={() =>
                                      toggleEquip(equipment.id)
                                    }
                                    equipFam={equipFamOf(equipment)}
                                    located={
                                      locateEquipmentId === equipment.id
                                    }
                                  >
                                    {expandedEquip.has(equipment.id) &&
                                      hasSsbBoardLayout(equipment) && (
                                        <SsbBoardView
                                          ssb={equipment}
                                          feed={circuit}
                                          protectionStatus={protectionStatus}
                                          energizedCircuitIds={
                                            energizedCircuitIds
                                          }
                                          energizedEquipmentIds={
                                            energizedEquipmentIds
                                          }
                                          lockedCircuits={lockedCircuits}
                                          onLocalBreaker={onLocalBreaker}
                                          onJumpToCircuit={onJumpToCircuit}
                                          onHoverInfo={showBalloonAt}
                                          onHoverInfoEnd={hideBalloon}
                                          expandedEquip={expandedEquip}
                                          onToggleEquip={toggleEquip}
                                          locateEquipmentId={
                                            locateEquipmentId
                                          }
                                        />
                                      )}
                                  </EquipmentBusDrop>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </EquipmentBusDrop>
                  )}
                </div>
              )
            })}
            {chains.length === 0 && (
              <p className="sys-plant__empty">
                No hay cadenas cargadas para este sistema.
              </p>
            )}
          </div>
        </div>
      </div>

      {balloon && (
        <CircuitBalloon
          circuit={balloon.circuit}
          state={protectionStatus[balloon.circuit.id]}
          x={balloon.x}
          y={balloon.y}
          fixed
          onClose={() => setBalloon(null)}
        />
      )}
    </div>
  )
})
