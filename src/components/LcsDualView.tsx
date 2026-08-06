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
  type LcsBoardModel,
  type LcsOutlet,
  type LcsSection,
  type LcsVoltageBus,
} from '../abtDownstream'
import { isSpareEquipment } from '../utils/spareCircuits'
import { lineBadge } from '../utils/cascadeModel'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
import { EquipmentBalloon } from './EquipmentBalloon'

/**
 * Filosofía LCS (como MSB):
 * TRF → QVS → barra VS — QVM — barra VM — QNV — barra NV (todo horizontal);
 * desde cada barra cuelgan las cargas de ese servicio.
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

function sectionOf(
  bus: LcsVoltageBus,
  service: ServiceClass,
): LcsSection | undefined {
  return bus.sections.find((s) => s.service === service)
}

function BusSegment({
  service,
  outlets,
  live,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  service: ServiceClass
  outlets: LcsOutlet[]
  live: boolean
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  return (
    <div className={`lcs-seg${live ? ' lcs-seg--live' : ''}`}>
      <div className="lcs-seg__label-row">
        <span className={`lcs-seg__svc lcs-seg__svc--${service}`}>{service}</span>
      </div>
      <div className="lcs-seg__rail" aria-hidden />
      <div className="lcs-seg__drops">
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
    </div>
  )
}

function SectionTie({
  breaker,
  flowing,
  locked,
  protectionStatus,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  breaker: Circuit
  flowing: boolean
  locked: boolean
  protectionStatus: Record<string, ProtectionState>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  return (
    <div className={`lcs-tie${flowing ? ' lcs-tie--flow' : ''}`}>
      <div className="lcs-tie__bridge" aria-hidden />
      <MiniBreaker
        name={breaker.protectionName}
        state={protectionStatus[breaker.id]}
        circuit={breaker}
        flowing={flowing}
        locked={locked}
        orientation="horizontal"
        onClick={(e) => onLocalBreaker(breaker, e)}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
      />
      <div className="lcs-tie__bridge" aria-hidden />
    </div>
  )
}

function VoltageRow({
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
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const vs = sectionOf(bus, 'VS')
  const vm = sectionOf(bus, 'VM')
  const nv = sectionOf(bus, 'NV')
  const inFlow = energizedCircuitIds.has(bus.incoming.id)
  const qvm = vm?.sectionBreaker
  const qnv = nv?.sectionBreaker
  const qvmFlow = qvm ? energizedCircuitIds.has(qvm.id) : false
  const qnvFlow = qnv ? energizedCircuitIds.has(qnv.id) : false

  /** VS vive con QVS; VM/NV con su acoplador (como mitades SA/SB + QBT). */
  const vsLive = inFlow
  const vmLive = inFlow && qvmFlow
  const nvLive = inFlow && qnvFlow

  return (
    <section className={`lcs-vrow${inFlow ? ' lcs-vrow--feed' : ''}`}>
      <div className="lcs-vrow__kv">{bus.voltage} V</div>

      <div className="lcs-vrow__rack">
        {/* Entrada TRF → QVS → barra VS */}
        <div className={`lcs-in${inFlow ? ' lcs-in--flow' : ''}`}>
          <span className="lcs-in__tag">TRF</span>
          <span className="lcs-in__wire" aria-hidden />
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
          <span className="lcs-in__wire lcs-in__wire--to-bus" aria-hidden />
        </div>

        <BusSegment
          service="VS"
          outlets={vs?.outlets ?? []}
          live={vsLive}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
        />

        {qvm && (
          <SectionTie
            breaker={qvm}
            flowing={qvmFlow}
            locked={lockedCircuits.has(qvm.id)}
            protectionStatus={protectionStatus}
            onLocalBreaker={onLocalBreaker}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
        )}

        <BusSegment
          service="VM"
          outlets={vm?.outlets ?? []}
          live={vmLive}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
        />

        {qnv && (
          <SectionTie
            breaker={qnv}
            flowing={qnvFlow}
            locked={lockedCircuits.has(qnv.id)}
            protectionStatus={protectionStatus}
            onLocalBreaker={onLocalBreaker}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
        )}

        <BusSegment
          service="NV"
          outlets={nv?.outlets ?? []}
          live={nvLive}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
        />
      </div>
    </section>
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
        <span className="lcs-dual__meta">
          desde {board.transformerId} · barras VS—VM—NV horizontales
        </span>
      </header>
      <div className="lcs-dual__rows">
        {board.buses.map((bus) => (
          <VoltageRow
            key={bus.voltage}
            bus={bus}
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
  )
}
