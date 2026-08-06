import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import {
  buildLcsBoardModel,
  type LcsBoardModel,
} from '../abtDownstream'
import { isSpareEquipment } from '../utils/spareCircuits'
import { lineBadge } from '../utils/cascadeModel'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
import { EquipmentBalloon } from './EquipmentBalloon'

function MiniBreaker({
  name,
  state,
  circuit,
  flowing,
  locked,
  onClick,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  name: string
  state?: ProtectionState
  circuit: Circuit
  flowing?: boolean
  locked?: boolean
  onClick: (e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const open = state !== 'cerrada'
  const hoverTimer = useRef<number | null>(null)
  const clear = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }
  useEffect(() => () => clear(), [])

  return (
    <button
      type="button"
      className={`casc-brk casc-brk--compact${state ? ` casc-brk--${state}` : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}`}
      data-circuit-id={circuit.id}
      title={`Interruptor ${name} · ${open ? 'abierto' : 'cerrado'}${locked ? ' · BLOQUEADO' : ''}`}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!onHoverInfo) return
        clear()
        const el = e.currentTarget
        hoverTimer.current = window.setTimeout(() => {
          onHoverInfo(circuit, el.getBoundingClientRect())
        }, 1800)
      }}
      onMouseLeave={() => {
        clear()
        onHoverInfoEnd?.()
      }}
    >
      <span className="casc-brk__sym">
        <MotorizedBreakerSymbol state={state} orientation="vertical" />
      </span>
      {locked && <LockBadge />}
      <span className="casc-brk__name">{name}</span>
    </button>
  )
}

function OutletChip({
  circuit,
  equipment,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  circuit: Circuit
  equipment: Equipment
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const spare = isSpareEquipment(equipment) || !!circuit.spare
  const flowing = energizedCircuitIds.has(circuit.id)
  const live = energizedEquipmentIds.has(equipment.id)
  const [hover, setHover] = useState(false)
  const [showBall, setShowBall] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hover) {
      setShowBall(false)
      return
    }
    const t = window.setTimeout(() => setShowBall(true), 1800)
    return () => window.clearTimeout(t)
  }, [hover])

  return (
    <div
      className={`lcs-out${spare ? ' lcs-out--spare' : ''}${live ? ' lcs-out--live' : ''}${flowing ? ' lcs-out--flow' : ''}`}
    >
      <MiniBreaker
        name={circuit.protectionName}
        state={protectionStatus[circuit.id]}
        circuit={circuit}
        flowing={flowing}
        locked={lockedCircuits.has(circuit.id)}
        onClick={(e) => onLocalBreaker(circuit, e)}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
      />
      <span className="lcs-out__wire" aria-hidden />
      <div
        ref={wrapRef}
        className={`lcs-out__eq${spare ? ' lcs-out__eq--spare' : ''}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="lcs-out__id">
          {spare ? circuit.protectionName : equipment.id}
        </span>
        <span className="lcs-out__name">
          {spare ? 'RESPETO' : equipment.name}
        </span>
        {circuit.lineType === 'alternativa' && (
          <span className="lcs-out__badge">{lineBadge(circuit.lineType)}</span>
        )}
      </div>
      {showBall && (
        <EquipmentBalloon
          equipment={equipment}
          feeds={[
            {
              name: circuit.protectionName,
              lineType: circuit.lineType,
              originId: circuit.originId,
            },
          ]}
          anchorRef={wrapRef}
        />
      )}
    </div>
  )
}

export function LcsDualView({
  lcsId,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  lcsId: string
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const board: LcsBoardModel | null = useMemo(
    () => buildLcsBoardModel(system690, lcsId),
    [lcsId],
  )

  if (!board) {
    return (
      <div className="lcs-dual lcs-dual--empty">
        Sin datos 440/230 para {lcsId}
      </div>
    )
  }

  return (
    <div className="lcs-dual">
      <header className="lcs-dual__head">
        <strong>{board.lcs.id}</strong>
        <span>{board.lcs.name}</span>
        <span className="lcs-dual__meta">desde {board.transformerId}</span>
      </header>
      <div className="lcs-dual__buses">
        {board.buses.map((bus) => {
          const inFlow = energizedCircuitIds.has(bus.incoming.id)
          return (
            <section
              key={bus.voltage}
              className={`lcs-bus${inFlow ? ' lcs-bus--live' : ''}`}
            >
              <div className="lcs-bus__title">
                <span className="lcs-bus__kv">{bus.voltage} V</span>
                <MiniBreaker
                  name={bus.incoming.protectionName}
                  state={protectionStatus[bus.incoming.id]}
                  circuit={bus.incoming}
                  flowing={inFlow}
                  locked={lockedCircuits.has(bus.incoming.id)}
                  onClick={(e) => onLocalBreaker(bus.incoming, e)}
                  onHoverInfo={onHoverInfo}
                  onHoverInfoEnd={onHoverInfoEnd}
                />
                <span className="lcs-bus__in-label">entrada TRF</span>
              </div>
              <div className="lcs-bus__rail" aria-hidden />
              <div className="lcs-bus__sections">
                {bus.sections.map((sec) => (
                  <div key={sec.service} className="lcs-sec">
                    <div className="lcs-sec__head">
                      <span className={`lcs-sec__svc lcs-sec__svc--${sec.service}`}>
                        {sec.service}
                      </span>
                      {sec.sectionBreaker && (
                        <MiniBreaker
                          name={sec.sectionBreaker.protectionName}
                          state={protectionStatus[sec.sectionBreaker.id]}
                          circuit={sec.sectionBreaker}
                          flowing={energizedCircuitIds.has(
                            sec.sectionBreaker.id,
                          )}
                          locked={lockedCircuits.has(sec.sectionBreaker.id)}
                          onClick={(e) =>
                            onLocalBreaker(sec.sectionBreaker!, e)
                          }
                          onHoverInfo={onHoverInfo}
                          onHoverInfoEnd={onHoverInfoEnd}
                        />
                      )}
                    </div>
                    <div className="lcs-sec__outs">
                      {sec.outlets.map(({ circuit, equipment }) => (
                        <OutletChip
                          key={circuit.id}
                          circuit={circuit}
                          equipment={equipment}
                          protectionStatus={protectionStatus}
                          energizedCircuitIds={energizedCircuitIds}
                          energizedEquipmentIds={energizedEquipmentIds}
                          lockedCircuits={lockedCircuits}
                          onLocalBreaker={onLocalBreaker}
                          onHoverInfo={onHoverInfo}
                          onHoverInfoEnd={onHoverInfoEnd}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
