import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState, ServiceClass } from '../types'
import {
  buildLcsBoardModel,
  type LcsOutlet,
  type LcsSection,
  type LcsVoltageBus,
} from '../abtDownstream'
import { isSpareEquipment } from '../utils/spareCircuits'
import { lineBadge } from '../utils/cascadeModel'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
import { EquipmentBalloon } from './EquipmentBalloon'

/**
 * LCS 440 V independiente: QVS → VS — QVM — VM — QNV — NV.
 * El TRF y el ABT son equipos aparte (recuadros propios).
 */

function MiniBreaker({
  name,
  state,
  circuit,
  flowing,
  locked,
  orientation = 'vertical',
  onClick,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  name: string
  state?: ProtectionState
  circuit: Circuit
  flowing?: boolean
  locked?: boolean
  orientation?: 'vertical' | 'horizontal'
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
      className={`casc-brk casc-brk--compact${state ? ` casc-brk--${state}` : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}${orientation === 'horizontal' ? ' casc-brk--horizontal' : ''}`}
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
        <MotorizedBreakerSymbol state={state} orientation={orientation} />
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
      <span className="lcs-out__stub" aria-hidden />
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

function sectionOf(bus: LcsVoltageBus, service: ServiceClass): LcsSection | undefined {
  return bus.sections.find((s) => s.service === service)
}

type SharedProps = {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}

function BusDrops({
  outlets,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  outlets: LcsOutlet[]
} & SharedProps) {
  return (
    <div className="lcs440-drops">
      {outlets.map(({ circuit, equipment }) => (
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
  )
}

/** Barra 440 V continua: VS —QVM— VM —QNV— NV con acopladores centrados. */
export function Lcs440Board({
  bus,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  bus: LcsVoltageBus
} & SharedProps) {
  const vs = sectionOf(bus, 'VS')
  const vm = sectionOf(bus, 'VM')
  const nv = sectionOf(bus, 'NV')
  const inFlow = energizedCircuitIds.has(bus.incoming.id)
  const qvm = vm?.sectionBreaker
  const qnv = nv?.sectionBreaker
  const qvmFlow = !!(qvm && energizedCircuitIds.has(qvm.id))
  const qnvFlow = !!(qnv && energizedCircuitIds.has(qnv.id))
  const vsLive = inFlow
  const vmLive = inFlow && qvmFlow
  const nvLive = inFlow && qnvFlow

  return (
    <div className={`lcs440-board${inFlow ? ' lcs440-board--live' : ''}`}>
      {/* QVS vive en la pierna TRF→LCS (recuadro independiente); aquí solo barras */}
      <div className="lcs440-rail">
        <div className="lcs440-rail__spine" aria-hidden />

        <div className={`lcs440-cell lcs440-cell--vs${vsLive ? ' lcs440-cell--live' : ''}`}>
          <span className="lcs440-cell__tag lcs440-cell__tag--VS">VS 440 V</span>
          <div className="lcs440-cell__bus" />
          <BusDrops
            outlets={vs?.outlets ?? []}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            lockedCircuits={lockedCircuits}
            onLocalBreaker={onLocalBreaker}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
        </div>

        {qvm && (
          <div className={`lcs440-tie${qvmFlow ? ' lcs440-tie--flow' : ''}`}>
            <MiniBreaker
              name={qvm.protectionName}
              state={protectionStatus[qvm.id]}
              circuit={qvm}
              flowing={qvmFlow}
              locked={lockedCircuits.has(qvm.id)}
              orientation="horizontal"
              onClick={(e) => onLocalBreaker(qvm, e)}
              onHoverInfo={onHoverInfo}
              onHoverInfoEnd={onHoverInfoEnd}
            />
            <span className="lcs440-tie__hint">→ VM</span>
          </div>
        )}

        <div className={`lcs440-cell lcs440-cell--vm${vmLive ? ' lcs440-cell--live' : ''}`}>
          <span className="lcs440-cell__tag lcs440-cell__tag--VM">VM 440 V</span>
          <div className="lcs440-cell__bus" />
          <BusDrops
            outlets={vm?.outlets ?? []}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            lockedCircuits={lockedCircuits}
            onLocalBreaker={onLocalBreaker}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
        </div>

        {qnv && (
          <div className={`lcs440-tie${qnvFlow ? ' lcs440-tie--flow' : ''}`}>
            <MiniBreaker
              name={qnv.protectionName}
              state={protectionStatus[qnv.id]}
              circuit={qnv}
              flowing={qnvFlow}
              locked={lockedCircuits.has(qnv.id)}
              orientation="horizontal"
              onClick={(e) => onLocalBreaker(qnv, e)}
              onHoverInfo={onHoverInfo}
              onHoverInfoEnd={onHoverInfoEnd}
            />
            <span className="lcs440-tie__hint">→ NV</span>
          </div>
        )}

        <div className={`lcs440-cell lcs440-cell--nv${nvLive ? ' lcs440-cell--live' : ''}`}>
          <span className="lcs440-cell__tag lcs440-cell__tag--NV">NV 440 V</span>
          <div className="lcs440-cell__bus" />
          <BusDrops
            outlets={nv?.outlets ?? []}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            lockedCircuits={lockedCircuits}
            onLocalBreaker={onLocalBreaker}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
        </div>
      </div>
    </div>
  )
}

/** Expandir LCS: solo su cuadro 440 V (equipo independiente del TRF). */
export function LcsDualView({
  lcsId,
  ...props
}: SharedProps & { lcsId: string }) {
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
    <div className="lcs-dual">
      <header className="lcs-dual__head">
        <strong>{board.lcs.id}</strong>
        <span>{board.lcs.name}</span>
        <span className="lcs-dual__meta">
          440 V · VS—QVM—VM—QNV—NV (230 V aparcado)
        </span>
      </header>
      <Lcs440Board bus={board.buses[0]} {...props} />
    </div>
  )
}
