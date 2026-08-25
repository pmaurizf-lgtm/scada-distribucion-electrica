/**
 * SSB-2PWS4531 (Excel fila 2864): INS → Q01 → 6 bases enchufe trifásicas.
 */

import type { MouseEvent as ReactMouseEvent } from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import { buildSsb4531Model } from '../abtDownstream/ssb2pws4531'
import { dataFlowVoltageProps } from '../utils/flowVoltage'
import { BreakerChip } from './BreakerChip'
import { TrifasicSocketSymbol } from './BreakerSymbols'

type SharedProps = {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}

export function Ssb4531BoardView({
  ssb,
  feed,
  ...shared
}: {
  ssb: Equipment
  feed: Circuit
} & SharedProps) {
  const model = buildSsb4531Model(system690)
  const { ins, q01, sockets } = model

  const inFlow = shared.energizedCircuitIds.has(feed.id)
  const insFlow = !!(ins && shared.energizedCircuitIds.has(ins.id))
  const q01Flow = !!(q01 && shared.energizedCircuitIds.has(q01.id))
  const q01Open = !!(q01 && shared.protectionStatus[q01.id] !== 'cerrada')
  const busLive =
    shared.energizedEquipmentIds.has(ssb.id) && (!ins || insFlow)
  const sktBarLive = busLive && q01Flow

  return (
    <div
      className={`ssb-board ssb-board--4531${inFlow ? ' ssb-board--fed' : ''}${busLive ? ' ssb-board--live' : ''}`}
      data-ssb={ssb.id}
      {...dataFlowVoltageProps(ssb.id)}
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

      {q01 && (
        <div
          className={`ssb4531-q01${q01Flow ? ' ssb4531-q01--flow' : ''}${q01Open && !q01Flow ? ' ssb4531-q01--open' : ''}`}
        >
          <span
            className={`ssb4531-q01__wire${insFlow && !q01Flow ? ' ssb4531-q01__wire--from-live' : ''}${q01Flow ? ' ssb4531-q01__wire--flow' : ''}`}
            aria-hidden
          />
          <BreakerChip
            name={q01.protectionName}
            state={shared.protectionStatus[q01.id]}
            compact
            circuitId={q01.id}
            circuit={q01}
            flowing={q01Flow}
            locked={shared.lockedCircuits.has(q01.id)}
            title={`${q01.protectionName} · ${q01.protectionModel ?? '32 A'} → enchufes trifásicos`}
            onClick={(e) => shared.onLocalBreaker(q01, e)}
            onHoverInfo={shared.onHoverInfo}
            onHoverInfoEnd={shared.onHoverInfoEnd}
          />
          <span
            className={`ssb4531-q01__wire ssb4531-q01__wire--to-skt${q01Flow ? ' ssb4531-q01__wire--flow' : ''}`}
            aria-hidden
          />
        </div>
      )}

      <div className="ssb4531-outlets">
        <div
          className={`ssb4531-skt-bar${sktBarLive ? ' ssb4531-skt-bar--live' : ''}`}
          aria-hidden
        />
        <div className="ssb4531-sockets" role="list" aria-label="Bases enchufe trifásicas">
          {sockets.map(({ circuit, equipment, index }) => {
            const flowing = shared.energizedCircuitIds.has(circuit.id)
            const live =
              flowing || shared.energizedEquipmentIds.has(equipment.id)
            return (
              <div
                key={circuit.id}
                className={`ssb4531-socket${flowing ? ' ssb4531-socket--flow' : ''}${live ? ' ssb4531-socket--live' : ''}`}
                role="listitem"
                title={equipment.name}
              >
                <span
                  className={`ssb4531-socket__wire${flowing ? ' ssb4531-socket__wire--flow' : ''}${sktBarLive && !flowing ? ' ssb4531-socket__wire--from-live' : ''}`}
                  aria-hidden
                />
                <TrifasicSocketSymbol live={live} flowing={flowing} />
                <span className="ssb4531-socket__idx">{index}</span>
                <span className="ssb4531-socket__id">{equipment.id}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
