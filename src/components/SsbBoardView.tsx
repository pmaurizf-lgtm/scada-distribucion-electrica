/**
 * Vista interior SSB 440 V: cable de acometida → INS → barra → salidas.
 * Mismo lenguaje visual que LCS (chasis, chips, bajantes NORM/ALT).
 *
 * SSB especiales: Q0n → TRF 440→115 → Q0n-01 → barra 115 V → Q51…;
 * opcionalmente Q03 → UPS → Q03-01/02.
 */

import type { MouseEvent as ReactMouseEvent } from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import {
  hasSsbBoardLayout,
  isSsb115BusCircuit,
  isSsb115InternalBus,
  isSsbIncomingCircuit,
  ssbIncomingCircuit,
} from '../abtDownstream/ssbBoard'
import { isSsb2Pws2209 } from '../abtDownstream/ssb2pws2209'
import {
  childFeeders,
  feedScopedChildFeeders,
  isAux24Feed,
  nestableChildFeeders,
} from '../utils/cascadeModel'
import { BreakerChip } from './BreakerChip'
import { EquipmentBusDrop, equipFamOf } from './EquipmentBusDrop'
import { Ssb2209BoardView } from './Ssb2209BoardView'

type SharedProps = {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit?: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  expandedEquip: Set<string>
  onToggleEquip: (id: string) => void
  focusCircuitIds?: Set<string> | null
  locateEquipmentId?: string | null
  /** Cadena ya abierta por encima (rompe ciclos al anidar). */
  ancestorIds?: ReadonlySet<string>
}

function isNestableOutlet(x: { circuit: Circuit; equipment: Equipment }) {
  return (
    !isSsbIncomingCircuit(x.circuit) &&
    (!x.equipment.virtual || isSsb115InternalBus(x.equipment))
  )
}

export function SsbBoardView({
  ssb,
  feed,
  ancestorIds,
  ...shared
}: {
  ssb: Equipment
  /** Circuito LCS → SSB (energía de acometida). */
  feed: Circuit
} & SharedProps) {
  if (isSsb2Pws2209(ssb.id)) {
    return (
      <Ssb2209BoardView
        ssb={ssb}
        feed={feed}
        ancestorIds={ancestorIds}
        {...shared}
      />
    )
  }

  const ins =
    ssbIncomingCircuit(system690, ssb.id) ??
    childFeeders(system690, ssb.id).find((x) =>
      isSsbIncomingCircuit(x.circuit),
    )?.circuit

  const outlets = childFeeders(system690, ssb.id).filter(
    (x) =>
      !isSsbIncomingCircuit(x.circuit) &&
      !x.equipment.virtual &&
      !x.circuit.destinationId.startsWith('BUS-'),
  )

  const focused = shared.focusCircuitIds
    ? outlets.filter((x) => shared.focusCircuitIds!.has(x.circuit.id))
    : outlets

  const inFlow = shared.energizedCircuitIds.has(feed.id)
  const insFlow = !!(ins && shared.energizedCircuitIds.has(ins.id))
  const busLive =
    shared.energizedEquipmentIds.has(ssb.id) && (!ins || insFlow)

  const boardAncestors = new Set(ancestorIds ?? [])
  boardAncestors.add(ssb.id)

  return (
    <div
      className={`ssb-board${inFlow ? ' ssb-board--fed' : ''}${busLive ? ' ssb-board--live' : ''}${!ins ? ' ssb-board--bus-only' : ''}`}
      data-ssb={ssb.id}
    >
      <div className="ssb-board__feed">
        <span
          className={`ssb-board__riser${inFlow ? ' ssb-board__riser--flow' : ''}`}
          aria-hidden
        />
        {ins && (
          <BreakerChip
            name={ins.protectionName}
            state={shared.protectionStatus[ins.id]}
            compact
            circuitId={ins.id}
            circuit={ins}
            flowing={insFlow}
            locked={shared.lockedCircuits.has(ins.id)}
            title={`${ins.protectionName} · entrada ${ssb.id}`}
            onClick={(e) => shared.onLocalBreaker(ins, e)}
            onHoverInfo={shared.onHoverInfo}
            onHoverInfoEnd={shared.onHoverInfoEnd}
          />
        )}
        <span
          className={`ssb-board__riser ssb-board__riser--to-bus${insFlow || (!ins && inFlow) ? ' ssb-board__riser--flow' : ''}`}
          aria-hidden
        />
      </div>

      <div
        className={`ssb-board__bus${busLive ? ' ssb-board__bus--live' : ''}`}
        aria-hidden
      />

      <div className="ssb-board__drops hbus hbus--nested hbus--lcs-section hbus--ssb-section">
        <div className="hbus__drops">
          {focused.map(({ circuit, equipment }) => (
            <div key={circuit.id} className="hbus__slot">
              <SsbOutletDrop
                circuit={circuit}
                equipment={equipment}
                ancestorIds={boardAncestors}
                {...shared}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Barra 115 V interna: Q0n-01 → barra → salidas Q5x (al expandir el TRF). */
function Ssb115InternalBoard({
  feed,
  bus,
  ancestorIds,
  ...shared
}: {
  feed: Circuit
  bus: Equipment
  ancestorIds: ReadonlySet<string>
} & SharedProps) {
  const outlets = nestableChildFeeders(system690, bus.id, {
    feedParentId: feed.originId,
    ancestorIds,
  }).filter((x) => !x.equipment.virtual)

  const focused = shared.focusCircuitIds
    ? outlets.filter((x) => shared.focusCircuitIds!.has(x.circuit.id))
    : outlets

  const feedFlow = shared.energizedCircuitIds.has(feed.id)
  const busLive = shared.energizedEquipmentIds.has(bus.id)
  const nextAncestors = new Set(ancestorIds)
  nextAncestors.add(bus.id)

  return (
    <div
      className={`ssb-board ssb-board--115${feedFlow ? ' ssb-board--fed' : ''}${busLive ? ' ssb-board--live' : ''}`}
      data-ssb-115={bus.id}
    >
      <div className="ssb-board__feed">
        <span
          className={`ssb-board__riser${feedFlow ? ' ssb-board__riser--flow' : ''}`}
          aria-hidden
        />
        <BreakerChip
          name={feed.protectionName}
          state={shared.protectionStatus[feed.id]}
          compact
          circuitId={feed.id}
          circuit={feed}
          flowing={feedFlow}
          locked={shared.lockedCircuits.has(feed.id)}
          title={`${feed.protectionName} · secundaria 115 V`}
          onClick={(e) => shared.onLocalBreaker(feed, e)}
          onHoverInfo={shared.onHoverInfo}
          onHoverInfoEnd={shared.onHoverInfoEnd}
        />
        <span
          className={`ssb-board__riser ssb-board__riser--to-bus${feedFlow ? ' ssb-board__riser--flow' : ''}`}
          aria-hidden
        />
      </div>
      <div className="ssb-board__bus-row">
        <span className="ssb-board__bus-tag">115 V</span>
        <div
          className={`ssb-board__bus${busLive ? ' ssb-board__bus--live' : ''}`}
          aria-hidden
        />
      </div>
      <div className="ssb-board__drops hbus hbus--nested hbus--lcs-section hbus--ssb-section">
        <div className="hbus__drops">
          {focused.map(({ circuit, equipment }) => (
            <div key={circuit.id} className="hbus__slot">
              <SsbOutletDrop
                circuit={circuit}
                equipment={equipment}
                ancestorIds={nextAncestors}
                {...shared}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SsbOutletDrop({
  circuit,
  equipment,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
  expandedEquip,
  onToggleEquip,
  focusCircuitIds,
  locateEquipmentId,
  ancestorIds,
}: {
  circuit: Circuit
  equipment: Equipment
  /** Ancestros ya abiertos: no volver a anidarlos (ciclos SSB↔TRF). */
  ancestorIds?: ReadonlySet<string>
} & SharedProps) {
  const kidsRaw = isAux24Feed(circuit)
    ? []
    : feedScopedChildFeeders(
        nestableChildFeeders(system690, equipment.id, {
          feedParentId: circuit.originId,
          ancestorIds,
        }).filter(isNestableOutlet),
        circuit,
      )

  const bus115Feed = kidsRaw.find(
    (x) => isSsb115BusCircuit(x.circuit) || isSsb115InternalBus(x.equipment),
  )
  const kids = kidsRaw.filter((x) => x !== bus115Feed)

  const canExpand =
    !isAux24Feed(circuit) &&
    (kids.length > 0 || !!bus115Feed || hasSsbBoardLayout(equipment))
  const expanded = expandedEquip.has(equipment.id)
  const nextAncestors = new Set(ancestorIds ?? [])
  nextAncestors.add(equipment.id)

  const nestCount = kids.length + (bus115Feed ? 1 : 0)

  return (
    <EquipmentBusDrop
      circuit={circuit}
      equipment={equipment}
      protectionStatus={protectionStatus}
      energizedCircuitIds={energizedCircuitIds}
      energizedEquipmentIds={energizedEquipmentIds}
      lockedCircuits={lockedCircuits}
      onLocalBreaker={onLocalBreaker}
      onJumpToCircuit={onJumpToCircuit}
      onHoverInfo={onHoverInfo}
      onHoverInfoEnd={onHoverInfoEnd}
      canExpand={canExpand}
      expanded={expanded}
      expandLabel={
        canExpand ? `${nestCount || ''} ${expanded ? '▴' : '▾'}`.trim() : undefined
      }
      onToggleExpand={
        canExpand ? () => onToggleEquip(equipment.id) : undefined
      }
      equipFam={equipFamOf(equipment)}
      located={locateEquipmentId === equipment.id}
      rootClassName={
        hasSsbBoardLayout(equipment) && expanded
          ? 'hbus-drop--ssb-open'
          : undefined
      }
    >
      {expanded && hasSsbBoardLayout(equipment) && (
        <SsbBoardView
          ssb={equipment}
          feed={circuit}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          expandedEquip={expandedEquip}
          onToggleEquip={onToggleEquip}
          focusCircuitIds={focusCircuitIds}
          locateEquipmentId={locateEquipmentId}
          ancestorIds={nextAncestors}
        />
      )}
      {expanded && bus115Feed && (
        <Ssb115InternalBoard
          feed={bus115Feed.circuit}
          bus={bus115Feed.equipment}
          ancestorIds={nextAncestors}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          expandedEquip={expandedEquip}
          onToggleEquip={onToggleEquip}
          focusCircuitIds={focusCircuitIds}
          locateEquipmentId={locateEquipmentId}
        />
      )}
      {expanded && !hasSsbBoardLayout(equipment) && kids.length > 0 && (
        <div className="hbus hbus--nested hbus--direct">
          <div className="hbus__drops">
            {kids.map(({ circuit: c, equipment: eq }) => (
              <div key={c.id} className="hbus__slot">
                <SsbOutletDrop
                  circuit={c}
                  equipment={eq}
                  protectionStatus={protectionStatus}
                  energizedCircuitIds={energizedCircuitIds}
                  energizedEquipmentIds={energizedEquipmentIds}
                  lockedCircuits={lockedCircuits}
                  onLocalBreaker={onLocalBreaker}
                  onJumpToCircuit={onJumpToCircuit}
                  onHoverInfo={onHoverInfo}
                  onHoverInfoEnd={onHoverInfoEnd}
                  expandedEquip={expandedEquip}
                  onToggleEquip={onToggleEquip}
                  focusCircuitIds={focusCircuitIds}
                  locateEquipmentId={locateEquipmentId}
                  ancestorIds={nextAncestors}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </EquipmentBusDrop>
  )
}
