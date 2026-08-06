import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, ProtectionState, ServiceClass } from '../types'
import {
  buildLcsBoardModel,
  type LcsOutlet,
  type LcsSection,
  type LcsVoltageBus,
} from '../abtDownstream'
import { BreakerChip } from './BreakerChip'
import { EquipmentBusDrop, equipFamOf } from './EquipmentBusDrop'

/**
 * LCS 440 V: mismo criterio visual que el cuadro principal (MSB).
 * QVS centrado sobre VS; barras VS—QVM—VM—QNV—NV; salidas = EquipmentBusDrop.
 */

type SharedProps = {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit?: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}

function sectionOf(bus: LcsVoltageBus, service: ServiceClass): LcsSection | undefined {
  return bus.sections.find((s) => s.service === service)
}

function BusDrops({
  outlets,
  ...shared
}: {
  outlets: LcsOutlet[]
} & SharedProps) {
  return (
    <div className="hbus hbus--nested hbus--lcs-section">
      <div className="hbus__drops">
        {outlets.map(({ circuit, equipment }) => (
          <div key={circuit.id} className="hbus__slot">
            <EquipmentBusDrop
              circuit={circuit}
              equipment={equipment}
              equipFam={equipFamOf(equipment)}
              {...shared}
            />
          </div>
        ))}
      </div>
    </div>
  )
}


/** Barra 440 V: QVS → VS — QVM — VM — QNV — NV. */
export function Lcs440Board({
  bus,
  incoming,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  bus: LcsVoltageBus
  /** Circuito QVS (energía); el chip está en la pierna TRF→LCS. */
  incoming?: Circuit
} & SharedProps) {
  const vs = sectionOf(bus, 'VS')
  const vm = sectionOf(bus, 'VM')
  const nv = sectionOf(bus, 'NV')
  const feed = incoming ?? bus.incoming
  const inFlow = !!(feed && energizedCircuitIds.has(feed.id))
  const qvm = vm?.sectionBreaker
  const qnv = nv?.sectionBreaker
  const qvmFlow = !!(qvm && energizedCircuitIds.has(qvm.id))
  const qnvFlow = !!(qnv && energizedCircuitIds.has(qnv.id))
  const vsLive = inFlow
  const vmLive = inFlow && qvmFlow
  const nvLive = inFlow && qnvFlow
  const shared = {
    protectionStatus,
    energizedCircuitIds,
    energizedEquipmentIds,
    lockedCircuits,
    onLocalBreaker,
    onJumpToCircuit,
    onHoverInfo,
    onHoverInfoEnd,
  }

  return (
    <div
      className={`lcs440-board${inFlow ? ' lcs440-board--live' : ''}${feed ? ' lcs440-board--fed' : ''}`}
    >
      <div className="lcs440-rail">
        {/* TRF (izq) → puente → QVS centrado en barra VS → bajante a bus */}
        {feed && (
          <>
            <span
              className={`lcs440-rail__feed-drop${inFlow ? ' lcs440-rail__feed-drop--flow' : ''}`}
              aria-hidden
            />
            <span
              className={`lcs440-rail__feed-jog${inFlow ? ' lcs440-rail__feed-jog--flow' : ''}`}
              aria-hidden
            />
            <div
              className={`lcs440-rail__qvs${inFlow ? ' lcs440-rail__qvs--flow' : ''}`}
            >
              <BreakerChip
                name={feed.protectionName}
                state={protectionStatus[feed.id]}
                compact
                circuitId={feed.id}
                circuit={feed}
                flowing={inFlow}
                locked={lockedCircuits.has(feed.id)}
                title={`${feed.protectionName} · entrada TRF → VS 440 V`}
                onClick={(e) => onLocalBreaker(feed, e)}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
            </div>
            <span
              className={`lcs440-rail__qvs-riser${inFlow ? ' lcs440-rail__qvs-riser--flow' : ''}`}
              aria-hidden
            />
          </>
        )}

        <span className="lcs440-cell__tag lcs440-cell__tag--VS lcs440-rail__vs-tag">
          VS 440 V
        </span>
        <div
          className={`lcs440-cell__bus lcs440-rail__vs-bus${vsLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        <div className="lcs440-rail__vs-drops">
          <BusDrops outlets={vs?.outlets ?? []} {...shared} />
        </div>

        {qvm ? (
          <div className={`lcs440-tie lcs440-rail__qvm${qvmFlow ? ' lcs440-tie--flow' : ''}`}>
            <span className="lcs440-tie__bridge lcs440-tie__bridge--left" aria-hidden />
            <BreakerChip
              name={qvm.protectionName}
              state={protectionStatus[qvm.id]}
              compact
              circuitId={qvm.id}
              circuit={qvm}
              flowing={qvmFlow}
              locked={lockedCircuits.has(qvm.id)}
              orientation="horizontal"
              onClick={(e) => onLocalBreaker(qvm, e)}
              onHoverInfo={onHoverInfo}
              onHoverInfoEnd={onHoverInfoEnd}
            />
            <span className="lcs440-tie__bridge lcs440-tie__bridge--right" aria-hidden />
          </div>
        ) : (
          <div className="lcs440-tie lcs440-rail__qvm" aria-hidden />
        )}

        <span className="lcs440-cell__tag lcs440-cell__tag--VM lcs440-rail__vm-tag">
          VM 440 V
        </span>
        <div
          className={`lcs440-cell__bus lcs440-rail__vm-bus${vmLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        <div className="lcs440-rail__vm-drops">
          <BusDrops outlets={vm?.outlets ?? []} {...shared} />
        </div>

        {qnv ? (
          <div className={`lcs440-tie lcs440-rail__qnv${qnvFlow ? ' lcs440-tie--flow' : ''}`}>
            <span className="lcs440-tie__bridge lcs440-tie__bridge--left" aria-hidden />
            <BreakerChip
              name={qnv.protectionName}
              state={protectionStatus[qnv.id]}
              compact
              circuitId={qnv.id}
              circuit={qnv}
              flowing={qnvFlow}
              locked={lockedCircuits.has(qnv.id)}
              orientation="horizontal"
              onClick={(e) => onLocalBreaker(qnv, e)}
              onHoverInfo={onHoverInfo}
              onHoverInfoEnd={onHoverInfoEnd}
            />
            <span className="lcs440-tie__bridge lcs440-tie__bridge--right" aria-hidden />
          </div>
        ) : (
          <div className="lcs440-tie lcs440-rail__qnv" aria-hidden />
        )}

        <span className="lcs440-cell__tag lcs440-cell__tag--NV lcs440-rail__nv-tag">
          NV 440 V
        </span>
        <div
          className={`lcs440-cell__bus lcs440-rail__nv-bus${nvLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        <div className="lcs440-rail__nv-drops">
          <BusDrops outlets={nv?.outlets ?? []} {...shared} />
        </div>
      </div>
    </div>
  )
}

/** Expandir LCS: barras 440 V. */
export function LcsDualView({
  lcsId,
  inline = false,
  incoming,
  ...props
}: SharedProps & {
  lcsId: string
  inline?: boolean
  incoming?: Circuit
}) {
  const board = useMemo(() => {
    const full = buildLcsBoardModel(system690, lcsId)
    if (!full) return null
    const bus440 = full.buses.find((b) => b.voltage === '440')
    if (!bus440) return null
    return { ...full, buses: [bus440] }
  }, [lcsId])

  if (!board) {
    return (
      <div className="lcs-dual lcs-dual--empty">
        Sin datos 440 V para {lcsId}
      </div>
    )
  }

  return (
    <div
      className={`lcs-dual${inline ? ' lcs-dual--inline' : ''}`}
      title={`${board.lcs.id} · ${board.lcs.name}`}
    >
      {!inline && (
        <header className="lcs-dual__head">
          <strong>{board.lcs.id}</strong>
          <span>{board.lcs.name}</span>
          <span className="lcs-dual__meta">
            440 V · VS—QVM—VM—QNV—NV (230 V aparcado)
          </span>
        </header>
      )}
      <Lcs440Board
        bus={board.buses[0]}
        incoming={
          inline ? incoming ?? board.buses[0].incoming : undefined
        }
        {...props}
      />
    </div>
  )
}
