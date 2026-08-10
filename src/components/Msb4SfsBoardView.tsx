/**
 * Interior MSB-4SFS (400 Hz): Q00 → barra 440 / barra 115 → salidas.
 * Misma UX de bajantes que SSB; acoples y retorno TRF compactos.
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

/** Acoplo MSB↔MSB: bajante corta, sin tarjeta de equipo completa. */
function CompactTie({
  circuit,
  peer,
  shared,
}: {
  circuit: Circuit
  peer: Equipment
  shared: SharedProps
}) {
  const flowing = shared.energizedCircuitIds.has(circuit.id)
  return (
    <div className="msb4sfs-tie" data-circuit-id={circuit.id}>
      <span
        className={`msb4sfs-tie__wire${flowing ? ' msb4sfs-tie__wire--flow' : ''}`}
        aria-hidden
      />
      <BreakerChip
        name={circuit.protectionName}
        state={shared.protectionStatus[circuit.id]}
        compact
        circuitId={circuit.id}
        circuit={circuit}
        flowing={flowing}
        locked={shared.lockedCircuits.has(circuit.id)}
        onClick={(e) => shared.onLocalBreaker(circuit, e)}
        onHoverInfo={shared.onHoverInfo}
        onHoverInfoEnd={shared.onHoverInfoEnd}
      />
      <span
        className={`msb4sfs-tie__wire${flowing ? ' msb4sfs-tie__wire--flow' : ''}`}
        aria-hidden
      />
      <button
        type="button"
        className={`msb4sfs-tie__peer${shared.locateEquipmentId === peer.id ? ' msb4sfs-tie__peer--locate' : ''}`}
        title={`Acoplo → ${peer.id}. Clic para ir al origen.`}
        onClick={(e) => {
          e.stopPropagation()
          shared.onJumpToCircuit?.(circuit)
        }}
      >
        <span className="msb4sfs-tie__acople">ACOPLO</span>
        <span className="msb4sfs-tie__id">{peer.id}</span>
      </button>
    </div>
  )
}

function BusSection({
  bus,
  label,
  outlets,
  interconnects,
  trfReturn,
  feedLive,
  ancestors,
  shared,
}: {
  bus: Msb4SfsBusVoltage
  label: string
  outlets: { circuit: Circuit; equipment: Equipment }[]
  interconnects: Circuit[]
  trfReturn?: Circuit
  feedLive: boolean
  ancestors: Set<string>
  shared: SharedProps
}) {
  const trfFlow = !!(
    trfReturn && shared.energizedCircuitIds.has(trfReturn.id)
  )
  const busLive =
    feedLive &&
    (bus === '440' ||
      !trfReturn ||
      trfFlow ||
      outlets.some((o) => shared.energizedCircuitIds.has(o.circuit.id)))

  return (
    <div
      className={`msb4sfs-bus msb4sfs-bus--${bus}${busLive ? ' msb4sfs-bus--live' : ''}`}
      data-bus={bus}
    >
      <span className="msb4sfs-bus__tag">{label}</span>

      {trfReturn && (
        <div
          className="msb4sfs-bus__incoming"
          title={`Retorno ${trfReturn.originId} → barra 115`}
        >
          <span className="msb4sfs-bus__incoming-from">
            {trfReturn.originId}
          </span>
          <BreakerChip
            name={trfReturn.protectionName}
            state={shared.protectionStatus[trfReturn.id]}
            compact
            circuitId={trfReturn.id}
            circuit={trfReturn}
            flowing={trfFlow}
            locked={shared.lockedCircuits.has(trfReturn.id)}
            onClick={(e) => shared.onLocalBreaker(trfReturn, e)}
            onHoverInfo={shared.onHoverInfo}
            onHoverInfoEnd={shared.onHoverInfoEnd}
          />
          <span
            className={`msb4sfs-bus__incoming-riser${trfFlow ? ' msb4sfs-bus__incoming-riser--flow' : ''}`}
            aria-hidden
          />
        </div>
      )}

      <div
        className={`msb4sfs-bus__rail${busLive ? ' msb4sfs-bus__rail--live' : ''}`}
        aria-hidden
      />

      {(interconnects.length > 0 || outlets.length > 0) && (
        <div className="msb4sfs-bus__drops hbus hbus--nested hbus--ssb-section">
          <div className="hbus__drops">
            {interconnects.map((c) => {
              const peer = system690.equipment.find(
                (e) => e.id === c.destinationId,
              )
              if (!peer) return null
              return (
                <div key={c.id} className="hbus__slot">
                  <CompactTie circuit={c} peer={peer} shared={shared} />
                </div>
              )
            })}
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

  const canExpand =
    kids.length > 0 || hasSsbBoardLayout(equipment)
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

export function Msb4SfsBoardView({
  msb,
  feed,
  ancestorIds,
  ...shared
}: {
  msb: Equipment
  /** Circuito SCV → MSB (energía de acometida). */
  feed: Circuit
} & SharedProps) {
  const feedLive = shared.energizedCircuitIds.has(feed.id)
  const boardLive = shared.energizedEquipmentIds.has(msb.id)
  const ancestors = new Set(ancestorIds ?? [])
  ancestors.add(msb.id)

  const outs440 = msb4SfsOutlets(system690, msb.id, '440')
  const outs115 = msb4SfsOutlets(system690, msb.id, '115')
  const ties440 = msb4SfsInterconnects(system690, msb.id, '440')
  const ties115 = msb4SfsInterconnects(system690, msb.id, '115')
  const trfReturn = msb4SfsTrfReturnFeed(system690, msb.id)

  return (
    <div
      className={`msb4sfs-board${feedLive ? ' msb4sfs-board--fed' : ''}${boardLive ? ' msb4sfs-board--live' : ''}`}
      data-msb={msb.id}
    >
      <BusSection
        bus="440"
        label="440 V · 400 Hz"
        outlets={outs440}
        interconnects={ties440}
        feedLive={feedLive && boardLive}
        ancestors={ancestors}
        shared={shared}
      />

      <BusSection
        bus="115"
        label="115 V · 400 Hz"
        outlets={outs115}
        interconnects={ties115}
        trfReturn={trfReturn}
        feedLive={feedLive && boardLive}
        ancestors={ancestors}
        shared={shared}
      />
    </div>
  )
}
