import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, ProtectionState, ServiceClass } from '../types'
import {
  buildLcsBoardModel,
  LCS_STYLE_PROFILE,
  LCS_VOLTAGE_LAYOUT,
  type LcsOutlet,
  type LcsParallelIncoming,
  type LcsSection,
  type LcsVoltageBus,
} from '../abtDownstream'
import { BreakerChip } from './BreakerChip'
import { EquipmentBalloon } from './EquipmentBalloon'
import { EquipmentBusDrop, equipFamOf, symbolFor } from './EquipmentBusDrop'

type FeedSyncVars = {
  feedCol: number
  feedOffset: number
  /** Dos salidas TRF→QVS (px de layout, sin zoom). */
  dual?: { out230: number; out440: number; stubH: number }
}

/** Factor de `transform: scale(zoom)` del unifilar (rect CSSOM / layout). */
function layoutZoom(el: HTMLElement): number {
  const w = el.offsetWidth
  if (w < 1) return 1
  const rw = el.getBoundingClientRect().width
  return rw > 0 ? rw / w : 1
}

function findTrfDrop(from: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = from
  while (el) {
    if (el.classList.contains('hbus-drop--feeds-lcs-open')) return el
    el = el.parentElement
  }
  return null
}

function applyFeedVars(fromEl: HTMLElement, vars: FeedSyncVars) {
  let el: HTMLElement | null = fromEl
  while (el) {
    if (
      el.classList.contains('hbus-drop--feeds-lcs-open') ||
      el.classList.contains('hbus-drop--chain-open') ||
      el.classList.contains('hbus-drop--lcs-open')
    ) {
      el.style.setProperty('--feed-col', `${vars.feedCol}px`)
      el.style.setProperty('--feed-offset', `${vars.feedOffset}px`)
      if (vars.dual && el.classList.contains('hbus-drop--feeds-lcs-open')) {
        el.classList.add('hbus-drop--dual-feed')
        el.style.setProperty('--trf-out-230', `${vars.dual.out230}px`)
        el.style.setProperty('--trf-out-440', `${vars.dual.out440}px`)
        el.style.setProperty('--trf-stub-h', `${vars.dual.stubH}px`)
      } else {
        el.classList.remove('hbus-drop--dual-feed')
        el.style.removeProperty('--trf-out-230')
        el.style.removeProperty('--trf-out-440')
        el.style.removeProperty('--trf-stub-h')
      }
    }
    el = el.parentElement
  }
}

/**
 * Ensancha ABT/TRF al vano VS 230+440 y coloca dos bajantes
 * alineadas con QVS (coordenadas de layout, corregidas por zoom).
 * Si hay CSB/QS* paralelo, alinea el recuadro CSB con el TRF (top + altura).
 */
function syncFeedCol(
  railsEl: HTMLElement,
  vs440: HTMLElement,
  vs230: HTMLElement | null,
  qvs440: HTMLElement | null,
  qvs230: HTMLElement | null,
) {
  const z = layoutZoom(railsEl)
  const railsLeft = railsEl.getBoundingClientRect().left
  const r440 = vs440.getBoundingClientRect()

  let feedCol: number
  let feedOffset: number

  if (vs230) {
    const r230 = vs230.getBoundingClientRect()
    feedCol = Math.ceil((r440.right - r230.left) / z)
    feedOffset = Math.max(0, Math.round((r230.left - railsLeft) / z))
  } else {
    feedCol = Math.ceil(r440.width / z)
    feedOffset = Math.max(0, Math.round((r440.left - railsLeft) / z))
  }
  if (feedCol < 1) return

  applyFeedVars(vs440, { feedCol, feedOffset })

  const trfDrop = findTrfDrop(vs440)
  const trfEq = trfDrop?.querySelector(
    ':scope > .hbus-drop__eq-wrap > .hbus-drop__eq',
  ) as HTMLElement | null

  if (!trfEq || !vs230 || !qvs230 || !qvs440) {
    applyFeedVars(vs440, { feedCol, feedOffset })
    syncParallelCsb(trfEq)
    return
  }

  void trfEq.offsetWidth
  const zTrf = layoutZoom(trfEq)
  const trfRect = trfEq.getBoundingClientRect()
  const chip230 =
    (qvs230.querySelector('.casc-brk') as HTMLElement | null)?.getBoundingClientRect() ??
    qvs230.getBoundingClientRect()
  const chip440 =
    (qvs440.querySelector('.casc-brk') as HTMLElement | null)?.getBoundingClientRect() ??
    qvs440.getBoundingClientRect()
  const out230 = Math.round(
    (chip230.left + chip230.width / 2 - trfRect.left) / zTrf,
  )
  const out440 = Math.round(
    (chip440.left + chip440.width / 2 - trfRect.left) / zTrf,
  )
  // Stub hasta el chip (el TRF pinta por encima del chasis vía z-index)
  const stubH = Math.max(
    12,
    Math.round((Math.min(chip230.top, chip440.top) - trfRect.bottom) / zTrf) + 2,
  )

  applyFeedVars(vs440, {
    feedCol,
    feedOffset,
    dual: { out230, out440, stubH },
  })
  syncParallelCsb(trfEq)
}

/** Alinea CSB con el recuadro TRF (misma cota superior y misma altura). */
function syncParallelCsb(trfEq: HTMLElement | null) {
  const csb = document.querySelector(
    '.lcs440-board--parallel-feed .lcs440-rail__parallel-src',
  ) as HTMLElement | null
  if (!csb) return
  if (!trfEq) {
    csb.style.removeProperty('top')
    csb.style.removeProperty('height')
    csb.style.removeProperty('min-height')
    csb.classList.remove('lcs440-rail__parallel-src--synced')
    return
  }
  const qsLeg = csb.parentElement
  if (!qsLeg) return

  const apply = () => {
    const z = layoutZoom(qsLeg)
    const trfRect = trfEq.getBoundingClientRect()
    const legRect = qsLeg.getBoundingClientRect()
    const top = Math.round((trfRect.top - legRect.top) / z)
    const height = Math.max(48, Math.round(trfRect.height / z))
    csb.style.top = `${top}px`
    csb.style.bottom = 'auto'
    csb.style.height = `${height}px`
    csb.style.minHeight = `${height}px`
    csb.classList.add('lcs440-rail__parallel-src--synced')

    const chip =
      (qsLeg.querySelector('.casc-brk') as HTMLElement | null)?.getBoundingClientRect() ??
      null
    if (chip) {
      const csbRect = csb.getBoundingClientRect()
      const gap = Math.max(6, Math.round((chip.top - csbRect.bottom) / z))
      csb.style.setProperty('--qs-drop-h', `${gap}px`)
    }
  }

  apply()
  // Segunda pasada tras ensanchar el TRF (--feed-col / dual stubs)
  requestAnimationFrame(apply)
}

function clearFeedSync(fromEl: HTMLElement) {
  let el: HTMLElement | null = fromEl
  while (el) {
    if (
      el.classList.contains('hbus-drop--feeds-lcs-open') ||
      el.classList.contains('hbus-drop--chain-open') ||
      el.classList.contains('hbus-drop--lcs-open')
    ) {
      el.style.removeProperty('--feed-col')
      el.style.removeProperty('--feed-offset')
      el.style.removeProperty('--trf-out-230')
      el.style.removeProperty('--trf-out-440')
      el.style.removeProperty('--trf-stub-h')
      el.classList.remove('hbus-drop--dual-feed')
    }
    el = el.parentElement
  }
  const csb = document.querySelector(
    '.lcs440-rail__parallel-src',
  ) as HTMLElement | null
  if (csb) {
    csb.style.removeProperty('top')
    csb.style.removeProperty('height')
    csb.style.removeProperty('min-height')
    csb.style.removeProperty('--qs-drop-h')
    csb.classList.remove('lcs440-rail__parallel-src--synced')
    csb.parentElement?.style.removeProperty('--qs-stub-h')
  }
}

/**
 * LCS 440/230 V: mismo criterio visual que el cuadro principal (MSB).
 * 230 a la izquierda (espejo NV→VS); 440 a la derecha (VS→NV).
 * TRF crece al vano de ambas VS con dos bajantes a QVS-230 / QVS-440.
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
  /** Equipo resaltado por el localizador del unifilar. */
  locateEquipmentId?: string | null
}

function sectionOf(bus: LcsVoltageBus, service: ServiceClass): LcsSection | undefined {
  return bus.sections.find((s) => s.service === service)
}

function BusDrops({
  outlets,
  locateEquipmentId,
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
              located={locateEquipmentId === equipment.id}
              {...shared}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Barra LCS: QVS → VS — QVM — VM — QNV — NV (o espejo si mirror). */
export function LcsVoltageBoard({
  bus,
  incoming,
  mirror = false,
  vsBusRef,
  qvsLegRef,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
  locateEquipmentId,
}: {
  bus: LcsVoltageBus
  /** Circuito QVS (energía); el chip está en la pierna TRF→LCS. */
  incoming?: Circuit
  /** Espejo horizontal (230 V a la izquierda). */
  mirror?: boolean
  vsBusRef?: RefObject<HTMLDivElement | null>
  qvsLegRef?: RefObject<HTMLDivElement | null>
} & SharedProps) {
  const vs = sectionOf(bus, 'VS')
  const vm = sectionOf(bus, 'VM')
  const nv = sectionOf(bus, 'NV')
  const feed = incoming ?? bus.incoming
  const parallel = bus.parallelIncoming
  const inFlow = !!(feed && energizedCircuitIds.has(feed.id))
  const parallelFlow = !!(
    parallel && energizedCircuitIds.has(parallel.circuit.id)
  )
  const qvm = vm?.sectionBreaker
  const qnv = nv?.sectionBreaker
  const qvmFlow = !!(qvm && energizedCircuitIds.has(qvm.id))
  const qnvFlow = !!(qnv && energizedCircuitIds.has(qnv.id))
  const vsLive = inFlow || parallelFlow
  const vmLive = vsLive && qvmFlow
  const nvLive = vsLive && qnvFlow
  const vLabel = `${bus.voltage} V`
  const shared = {
    protectionStatus,
    energizedCircuitIds,
    energizedEquipmentIds,
    lockedCircuits,
    onLocalBreaker,
    onJumpToCircuit,
    onHoverInfo,
    onHoverInfoEnd,
    locateEquipmentId,
  }

  const qvsLeg = feed ? (
    <div
      ref={qvsLegRef}
      className={`lcs440-rail__qvs-leg${inFlow ? ' lcs440-rail__qvs-leg--flow' : ''}`}
      data-qvs={bus.voltage}
    >
      <span className="lcs440-rail__qvs-leg__wire lcs440-rail__qvs-leg__wire--from" aria-hidden />
      <BreakerChip
        name={feed.protectionName}
        state={protectionStatus[feed.id]}
        compact
        circuitId={feed.id}
        circuit={feed}
        flowing={inFlow}
        locked={lockedCircuits.has(feed.id)}
        title={`${feed.protectionName} · entrada TRF → VS ${vLabel}`}
        onClick={(e) => onLocalBreaker(feed, e)}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
      />
      <span className="lcs440-rail__qvs-leg__wire lcs440-rail__qvs-leg__wire--to-bus" aria-hidden />
    </div>
  ) : null

  const parallelLeg = parallel ? (
    <ParallelFeedLeg
      parallel={parallel}
      voltageLabel={vLabel}
      flowing={parallelFlow}
      eqLive={energizedEquipmentIds.has(parallel.equipment.id)}
      {...shared}
    />
  ) : null

  const vsBlock = (
    <>
      <span className="lcs440-cell__tag lcs440-cell__tag--VS lcs440-rail__vs-tag">
        VS {vLabel}
      </span>
      <div className="lcs440-rail__vs-bus-track">
        <div
          ref={vsBusRef}
          className={`lcs440-cell__bus lcs440-rail__vs-bus${vsLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        {parallel && (
          <div
            className={`lcs440-cell__bus lcs440-rail__vs-bus lcs440-rail__vs-bus--parallel-ext${vsLive ? ' lcs440-cell__bus--live' : ''}`}
            aria-hidden
          />
        )}
      </div>
      <div className="lcs440-rail__vs-drops">
        <BusDrops outlets={vs?.outlets ?? []} {...shared} />
        {parallel && (
          <div className="lcs440-rail__vs-parallel-spacer" aria-hidden />
        )}
      </div>
    </>
  )

  const qvmBlock = qvm ? (
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
  )

  const vmBlock = (
    <>
      <span className="lcs440-cell__tag lcs440-cell__tag--VM lcs440-rail__vm-tag">
        VM {vLabel}
      </span>
      <div
        className={`lcs440-cell__bus lcs440-rail__vm-bus${vmLive ? ' lcs440-cell__bus--live' : ''}`}
      />
      <div className="lcs440-rail__vm-drops">
        <BusDrops outlets={vm?.outlets ?? []} {...shared} />
      </div>
    </>
  )

  const qnvBlock = qnv ? (
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
  )

  const nvBlock = (
    <>
      <span className="lcs440-cell__tag lcs440-cell__tag--NV lcs440-rail__nv-tag">
        NV {vLabel}
      </span>
      <div
        className={`lcs440-cell__bus lcs440-rail__nv-bus${nvLive ? ' lcs440-cell__bus--live' : ''}`}
      />
      <div className="lcs440-rail__nv-drops">
        <BusDrops outlets={nv?.outlets ?? []} {...shared} />
      </div>
    </>
  )

  const feedBay =
    parallel && qvsLeg ? (
      <div className="lcs440-rail__feed-bay">
        {qvsLeg}
        {parallelLeg}
      </div>
    ) : (
      qvsLeg
    )

  return (
    <div
      className={`lcs440-board${mirror ? ' lcs440-board--mirror' : ''}${vsLive ? ' lcs440-board--live' : ''}${feed ? ' lcs440-board--fed' : ''}${parallel ? ' lcs440-board--parallel-feed' : ''}`}
      data-voltage={bus.voltage}
    >
      <div className={`lcs440-rail${mirror ? ' lcs440-rail--mirror' : ''}`}>
        {feedBay}
        {vsBlock}
        {qvmBlock}
        {vmBlock}
        {qnvBlock}
        {nvBlock}
      </div>
    </div>
  )
}

/** CSB (u origen) + QS* encima de la extensión de barra VS, a la derecha del TRF. */
function ParallelFeedLeg({
  parallel,
  voltageLabel,
  flowing,
  eqLive,
  protectionStatus,
  lockedCircuits,
  onLocalBreaker,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  parallel: LcsParallelIncoming
  voltageLabel: string
  flowing: boolean
  eqLive: boolean
} & SharedProps) {
  const { circuit, equipment } = parallel
  const eqWrapRef = useRef<HTMLDivElement>(null)
  const [eqHover, setEqHover] = useState(false)
  const [showEqBalloon, setShowEqBalloon] = useState(false)

  useEffect(() => {
    if (!eqHover) {
      setShowEqBalloon(false)
      return
    }
    const t = window.setTimeout(() => setShowEqBalloon(true), 1800)
    return () => window.clearTimeout(t)
  }, [eqHover])

  return (
    <div
      className={`lcs440-rail__qs-leg${flowing ? ' lcs440-rail__qs-leg--flow' : ''}`}
      data-qs={circuit.protectionName}
    >
      <div
        ref={eqWrapRef}
        className={`lcs440-rail__parallel-src hbus-drop__eq--fam-${equipFamOf(equipment)}${eqLive ? ' lcs440-rail__parallel-src--live' : ''}${flowing ? ' lcs440-rail__parallel-src--flow' : ''}`}
        data-equip={equipment.id}
        title={`${equipment.id} · ${equipment.name} · alimentación → ${circuit.protectionName}`}
        onMouseEnter={() => setEqHover(true)}
        onMouseLeave={() => setEqHover(false)}
      >
        <span className="hbus-drop__sym">{symbolFor(equipment.kind)}</span>
        <span className="hbus-drop__id">{equipment.id}</span>
        {equipment.dcp10Id && (
          <span className="hbus-drop__dcp" title="Denominación DCP-10">
            {equipment.dcp10Id}
          </span>
        )}
        <span className="hbus-drop__name">{equipment.name}</span>
        {showEqBalloon && (
          <EquipmentBalloon
            equipment={equipment}
            circuits={[circuit]}
            anchorRef={eqWrapRef}
          />
        )}
      </div>
      <span
        className="lcs440-rail__qvs-leg__wire lcs440-rail__qvs-leg__wire--from lcs440-rail__qs-leg__wire--from"
        aria-hidden
      />
      <BreakerChip
        name={circuit.protectionName}
        state={protectionStatus[circuit.id]}
        compact
        circuitId={circuit.id}
        circuit={circuit}
        flowing={flowing}
        locked={lockedCircuits.has(circuit.id)}
        title={`${circuit.protectionName} · entrada ${equipment.id} → VS ${voltageLabel}`}
        onClick={(e) => onLocalBreaker(circuit, e)}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
      />
      <span
        className="lcs440-rail__qvs-leg__wire lcs440-rail__qvs-leg__wire--to-bus"
        aria-hidden
      />
    </div>
  )
}

/** @deprecated Usar LcsVoltageBoard; se mantiene el nombre exportado. */
export const Lcs440Board = LcsVoltageBoard

/** Expandir LCS: barras 230 V (izq., espejo) + 440 V (der.). */
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
  const railsRef = useRef<HTMLDivElement>(null)
  const vs440Ref = useRef<HTMLDivElement>(null)
  const vs230Ref = useRef<HTMLDivElement>(null)
  const qvs440Ref = useRef<HTMLDivElement>(null)
  const qvs230Ref = useRef<HTMLDivElement>(null)

  const board = useMemo(() => buildLcsBoardModel(system690, lcsId), [lcsId])

  const busPrimary = board?.buses.find(
    (b) => b.voltage === LCS_VOLTAGE_LAYOUT.right,
  )
  const busSecondary = board?.buses.find(
    (b) => b.voltage === LCS_VOLTAGE_LAYOUT.left,
  )
  const bus440 = busPrimary
  const bus230 = busSecondary

  useLayoutEffect(() => {
    const vs440 = vs440Ref.current
    const railsEl = railsRef.current
    if (!vs440 || !railsEl) return
    const apply = () =>
      syncFeedCol(
        railsEl,
        vs440,
        bus230 ? vs230Ref.current : null,
        qvs440Ref.current,
        bus230 ? qvs230Ref.current : null,
      )
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(vs440)
    ro.observe(railsEl)
    const vs230 = vs230Ref.current
    if (vs230) ro.observe(vs230)
    const qvs440 = qvs440Ref.current
    if (qvs440) ro.observe(qvs440)
    const qvs230 = qvs230Ref.current
    if (qvs230) ro.observe(qvs230)
    return () => {
      ro.disconnect()
      clearFeedSync(vs440)
    }
  }, [board, bus230, bus440, incoming])

  if (!board || (!bus440 && !bus230)) {
    return (
      <div className="lcs-dual lcs-dual--empty">
        Sin datos 440/230 V para {lcsId}
      </div>
    )
  }

  return (
    <div
      className={`lcs-dual${inline ? ' lcs-dual--inline' : ''}${bus230 && bus440 ? ' lcs-dual--both' : ''}`}
      title={`${board.lcs.id} · ${board.lcs.name}`}
      data-lcs-style={LCS_STYLE_PROFILE.referenceId}
    >
      {!inline && (
        <header className="lcs-dual__head">
          <strong>{board.lcs.id}</strong>
          <span>{board.lcs.name}</span>
          <span className="lcs-dual__meta">
            {bus230 && bus440
              ? '230 V (espejo) · 440 V · VS—QVM—VM—QNV—NV'
              : bus440
                ? '440 V · VS—QVM—VM—QNV—NV'
                : '230 V · VS—QVM—VM—QNV—NV'}
          </span>
        </header>
      )}
      <div className="lcs-dual__rails" ref={railsRef}>
        {bus230 && (
          <LcsVoltageBoard
            bus={bus230}
            incoming={bus230.incoming}
            mirror
            vsBusRef={vs230Ref}
            qvsLegRef={qvs230Ref}
            {...props}
          />
        )}
        {bus440 && (
          <LcsVoltageBoard
            bus={bus440}
            incoming={inline ? incoming ?? bus440.incoming : bus440.incoming}
            vsBusRef={vs440Ref}
            qvsLegRef={qvs440Ref}
            {...props}
          />
        )}
      </div>
    </div>
  )
}
