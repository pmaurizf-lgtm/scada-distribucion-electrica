/**
 * Interior MSB-4SFS (400 Hz), estilo planta MSB-6PWS:
 * Q00 (acometida) → barra horizontal; Q01/Q51 bus-tie encima de la barra;
 * salidas colgando. El cable SCV→MSB es continuo en el unifilar (sin chip).
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import { hasSsbBoardLayout } from '../abtDownstream/ssbBoard'
import {
  isAux24Feed,
  nestableChildFeeders,
} from '../utils/cascadeModel'
import {
  isMsb4SfsInterconnect,
  msb4SfsInterconnects,
  msb4SfsOutlets,
  msb4SfsTieSide,
  msb4SfsTrfReturnFeed,
  type Msb4SfsBusVoltage,
} from '../voltageSystems/hz400'
import { BreakerChip } from './BreakerChip'
import { EquipmentBusDrop, equipFamOf } from './EquipmentBusDrop'
import { SsbBoardView } from './SsbBoardView'

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
  locateEquipmentId?: string | null
  ancestorIds?: ReadonlySet<string>
}

function OutletDrop({
  circuit,
  equipment,
  ancestors,
  shared,
}: {
  circuit: Circuit
  equipment: Equipment
  ancestors: Set<string>
  shared: SharedProps
}) {
  if (isAux24Feed(circuit)) return null

  const kids = nestableChildFeeders(system690, equipment.id, {
    feedParentId: circuit.originId,
    ancestorIds: ancestors,
  }).filter((x) => !x.equipment.virtual && !isMsb4SfsInterconnect(x.circuit))

  const canExpand = kids.length > 0 || hasSsbBoardLayout(equipment)
  const expanded = shared.expandedEquip.has(equipment.id)
  const nextAncestors = new Set(ancestors)
  nextAncestors.add(equipment.id)

  let nested: ReactNode = null
  if (expanded && hasSsbBoardLayout(equipment)) {
    nested = (
      <SsbBoardView
        ssb={equipment}
        feed={circuit}
        ancestorIds={nextAncestors}
        protectionStatus={shared.protectionStatus}
        energizedCircuitIds={shared.energizedCircuitIds}
        energizedEquipmentIds={shared.energizedEquipmentIds}
        lockedCircuits={shared.lockedCircuits}
        onLocalBreaker={shared.onLocalBreaker}
        onJumpToCircuit={shared.onJumpToCircuit}
        onHoverInfo={shared.onHoverInfo}
        onHoverInfoEnd={shared.onHoverInfoEnd}
        expandedEquip={shared.expandedEquip}
        onToggleEquip={shared.onToggleEquip}
        locateEquipmentId={shared.locateEquipmentId}
      />
    )
  } else if (expanded && kids.length > 0) {
    nested = (
      <div className="hbus hbus--nested hbus--direct">
        <div className="hbus__drops">
          {kids.map(({ circuit: kc, equipment: ke }) => (
            <div key={kc.id} className="hbus__slot">
              <OutletDrop
                circuit={kc}
                equipment={ke}
                ancestors={nextAncestors}
                shared={shared}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <EquipmentBusDrop
      circuit={circuit}
      equipment={equipment}
      protectionStatus={shared.protectionStatus}
      energizedCircuitIds={shared.energizedCircuitIds}
      energizedEquipmentIds={shared.energizedEquipmentIds}
      lockedCircuits={shared.lockedCircuits}
      onLocalBreaker={shared.onLocalBreaker}
      onJumpToCircuit={shared.onJumpToCircuit}
      onHoverInfo={shared.onHoverInfo}
      onHoverInfoEnd={shared.onHoverInfoEnd}
      canExpand={canExpand}
      expanded={expanded}
      expandLabel={expanded ? '▴' : '▾'}
      onToggleExpand={() => shared.onToggleEquip(equipment.id)}
      equipFam={equipFamOf(equipment)}
      located={shared.locateEquipmentId === equipment.id}
    >
      {nested}
    </EquipmentBusDrop>
  )
}

/** Tramo de barra (440 o 115): entrada → bus-tie → barra → salidas. */
function RackSection({
  bus,
  tag,
  msbId,
  incoming,
  incomingLabel,
  interconnect,
  outlets,
  feedLive,
  busLive,
  tieSide,
  ancestors,
  shared,
}: {
  bus: Msb4SfsBusVoltage
  tag: string
  msbId: string
  incoming?: Circuit
  incomingLabel?: string
  interconnect?: Circuit
  outlets: { circuit: Circuit; equipment: Equipment }[]
  feedLive: boolean
  busLive: boolean
  tieSide: 'left' | 'right'
  ancestors: Set<string>
  shared: SharedProps
}) {
  const inFlow = !!(incoming && shared.energizedCircuitIds.has(incoming.id))
  const tieFlow = !!(
    interconnect && shared.energizedCircuitIds.has(interconnect.id)
  )
  const peerBoard = interconnect
    ? system690.equipment.find(
        (e) =>
          (e.id === interconnect.originId ||
            e.id === interconnect.destinationId) &&
          e.id !== msbId,
      )
    : undefined

  return (
    <div
      className={`msb4sfs-rack msb4sfs-rack--${bus}${busLive ? ' msb4sfs-rack--live' : ''}`}
      data-bus={bus}
    >
      <div className="msb4sfs-rack__inner-top">
        <div className="msb4sfs-rack__in-row">
          {incoming ? (
            <div
              className={`msb4sfs-rack__in-slot${inFlow ? ' msb4sfs-rack__in-slot--flow' : ''}`}
              data-circuit-id={incoming.id}
              title={
                incomingLabel
                  ? `${incoming.protectionName} · ${incomingLabel}`
                  : `${incoming.protectionName} · acometida a barra ${tag}`
              }
            >
              <span
                className={`msb4sfs-rack__vwire msb4sfs-rack__vwire--from-feed${inFlow || feedLive ? ' msb4sfs-rack__vwire--flow' : ''}`}
                aria-hidden
              />
              <BreakerChip
                name={incoming.protectionName}
                state={shared.protectionStatus[incoming.id]}
                compact
                circuitId={incoming.id}
                circuit={incoming}
                flowing={inFlow}
                locked={shared.lockedCircuits.has(incoming.id)}
                title={`${incoming.protectionName} · entrada barra ${tag}`}
                onClick={(e) => shared.onLocalBreaker(incoming, e)}
                onHoverInfo={shared.onHoverInfo}
                onHoverInfoEnd={shared.onHoverInfoEnd}
              />
              <span
                className={`msb4sfs-rack__vwire msb4sfs-rack__vwire--to-rail${inFlow ? ' msb4sfs-rack__vwire--flow' : ''}`}
                aria-hidden
              />
            </div>
          ) : (
            <div className="msb4sfs-rack__in-slot msb4sfs-rack__in-slot--empty" />
          )}
        </div>

        {interconnect && (
          <div
            className={`msb4sfs-rack__bustie msb4sfs-rack__bustie--${tieSide}${tieFlow ? ' msb4sfs-rack__bustie--flow' : ''}`}
            data-circuit-id={interconnect.id}
          >
            <span
              className={`msb4sfs-rack__bustie-free${tieFlow ? ' msb4sfs-rack__bustie-free--flow' : ''}`}
              aria-hidden
            />
            <BreakerChip
              name={interconnect.protectionName}
              state={shared.protectionStatus[interconnect.id]}
              compact
              circuitId={interconnect.id}
              circuit={interconnect}
              flowing={tieFlow}
              locked={shared.lockedCircuits.has(interconnect.id)}
              title={`${interconnect.protectionName} · interconexión${peerBoard ? ` · ${peerBoard.id}` : ''}`}
              onClick={(e) => shared.onLocalBreaker(interconnect, e)}
              onHoverInfo={shared.onHoverInfo}
              onHoverInfoEnd={shared.onHoverInfoEnd}
            />
            <span className="msb4sfs-rack__bustie-mid" aria-hidden />
            <span className="msb4sfs-rack__bustie-tag">
              INTERCONEXIÓN
              <br />
              el otro MSB-4SFS
              {peerBoard ? (
                <>
                  <br />
                  {peerBoard.id}
                </>
              ) : null}
            </span>
            <div className="msb4sfs-rack__bustie-down" aria-hidden />
            {peerBoard && (
              <button
                type="button"
                className="msb4sfs-rack__bustie-peer"
                title={`Ir a ${peerBoard.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  shared.onJumpToCircuit?.(interconnect)
                }}
              >
                →
              </button>
            )}
          </div>
        )}
      </div>

      <div className="msb4sfs-rack__bus-row">
        <span className="msb4sfs-rack__rail-tag">{tag}</span>
        <div
          className={`msb4sfs-rack__rail${busLive ? ' msb4sfs-rack__rail--live' : ''}`}
          aria-hidden
        />
      </div>

      {outlets.length > 0 && (
        <div className="msb4sfs-rack__drops hbus hbus--nested hbus--ssb-section">
          <div className="hbus__drops">
            {outlets.map(({ circuit, equipment }) => (
              <div key={circuit.id} className="hbus__slot">
                <OutletDrop
                  circuit={circuit}
                  equipment={equipment}
                  ancestors={ancestors}
                  shared={shared}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Msb4SfsBoardView({
  msb,
  feed,
  ancestorIds,
  ...shared
}: {
  msb: Equipment
  /** Circuito SCV → MSB (Q00): chip dentro del rack, no en el cable. */
  feed: Circuit
} & SharedProps) {
  const feedLive = shared.energizedCircuitIds.has(feed.id)
  const boardLive = shared.energizedEquipmentIds.has(msb.id)
  const ancestors = new Set(ancestorIds ?? [])
  ancestors.add(msb.id)
  const tieSide = msb4SfsTieSide(msb.id)

  const outs440 = msb4SfsOutlets(system690, msb.id, '440')
  const outs115 = msb4SfsOutlets(system690, msb.id, '115')
  const tie440 = msb4SfsInterconnects(system690, msb.id, '440')[0]
  const tie115 = msb4SfsInterconnects(system690, msb.id, '115')[0]
  const trfReturn = msb4SfsTrfReturnFeed(system690, msb.id)

  const bus440Live = feedLive && boardLive
  const bus115Live =
    boardLive &&
    (!!(trfReturn && shared.energizedCircuitIds.has(trfReturn.id)) ||
      outs115.some((o) => shared.energizedCircuitIds.has(o.circuit.id)))

  return (
    <div
      className={`msb4sfs-board${feedLive ? ' msb4sfs-board--fed' : ''}${boardLive ? ' msb4sfs-board--live' : ''}`}
      data-msb={msb.id}
    >
      <RackSection
        bus="440"
        tag="440 V"
        msbId={msb.id}
        incoming={feed}
        incomingLabel={`desde ${feed.originId}`}
        interconnect={tie440}
        outlets={outs440}
        feedLive={feedLive}
        busLive={bus440Live}
        tieSide={tieSide}
        ancestors={ancestors}
        shared={shared}
      />

      <RackSection
        bus="115"
        tag="115 V"
        msbId={msb.id}
        incoming={trfReturn}
        incomingLabel={
          trfReturn ? `retorno ${trfReturn.originId}` : undefined
        }
        interconnect={tie115}
        outlets={outs115}
        feedLive={feedLive}
        busLive={bus115Live}
        tieSide={tieSide}
        ancestors={ancestors}
        shared={shared}
      />
    </div>
  )
}
