import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { buildLcsBoardModel, isLcsEquipment } from '../abtDownstream/model'
import { isMotorizedProtectionModel } from '../abtDownstream/ssbBoard'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState, ServiceClass } from '../types'
import {
  incomingFeeds,
  is24VCircuit,
  isLinkOnlyOutgoingFeed,
  isAux24Feed,
  isLcsOutletFeed,
  isMsb24Equipment,
  isParallelLcsTopFeed,
  isPendingFeed,
  isTrfToLcsQvsFeed,
  lineBadge,
  msb24SourceForAuxOrigin,
} from '../utils/cascadeModel'
import type { StartupDestination } from '../startupFeeds/types'
import type { UpstreamTrace } from '../utils/upstream'
import {
  filterFeedsByBusVoltage,
  normalizeLcsBusVoltage,
} from '../utils/upstream'
import {
  dataFlowVoltageFromCircuit,
  dataFlowVoltageFromLcsBus,
  dataFlowVoltageProps,
  type FlowVoltage,
} from '../utils/flowVoltage'
import { labelSecondaryDenom } from '../utils/equipmentLabels'
import {
  LockBadge,
  ManualBreakerSymbol,
  MotorizedBreakerSymbol,
} from './BreakerSymbols'
import { CircuitBalloon, placeCircuitBalloon } from './CircuitBalloon'
import { EquipmentBalloon } from './EquipmentBalloon'

interface SearchTreeViewProps {
  equipmentId: string
  trace: UpstreamTrace
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  /** Informe arranque: bajantes aguas abajo del origen común (col. L). */
  hubDownstream?: StartupDestination[]
  /** Solo lectura (sin globos ni clic en interruptores). */
  reportMode?: boolean
  showHeader?: boolean
  groupCaption?: string
}

const HOVER_DELAY_MS = 1800

function eqById(id: string): Equipment | undefined {
  return system690.equipment.find((e) => e.id === id)
}

/**
 * Tope del árbol de búsqueda (aguas arriba).
 * - MSB-6PWS*: cuadro 690 V (sin generadores / QG*).
 * - PNL-MSB*: no es tope — se sube al MSB por el BUS virtual.
 * - 24 V ALT/AUX: tope MSB-24 en `upstreamEdges` / `capAtMsb24`.
 */
function isMainBoardNode(id: string): boolean {
  if (/^MSB-6PWS/i.test(id)) return true
  if (/^PNL-MSB/i.test(id)) return false
  const eq = eqById(id)
  return eq?.kind === 'generador'
}

/** Origen por encima del cuadro (generadores / QG*) */
function isGeneratorSide(circuit: Circuit): boolean {
  if (/^QG/i.test(circuit.protectionName)) return true
  if (circuit.originId.startsWith('SDG-')) return true
  return eqById(circuit.originId)?.kind === 'generador'
}

/** Enlace continuo sin chip (ABT→TRF…). QVS se pinta bajo el LCS, no aquí. */
function isThruFeed(circuit: Circuit): boolean {
  return isLinkOnlyOutgoingFeed(circuit)
}

/** Acometidas TRF→LCS vía QVS: el padre se une con un solo cable; QVS va bajo el LCS. */
function isTrfLcsQvsFeedGroup(feeds: Circuit[]): boolean {
  return feeds.length > 0 && feeds.every((f) => isTrfToLcsQvsFeed(f))
}

/**
 * 24 V alternativa / AUX / pendiente: no subir por encima del MSB-24.
 * 24 V normal (potencia): desarrollo completo (RCT, LCS…).
 */
function feedCapsAtMsb24(circuit: Circuit): boolean {
  if (isAux24Feed(circuit)) return true
  if (!is24VCircuit(circuit)) return false
  return (
    circuit.lineType === 'alternativa' || isPendingFeed(circuit)
  )
}

/**
 * Aristas aguas arriba hasta el cuadro principal (paneles MSB).
 * No incluye generadores ni QG*. Las QS* paralelas no suben como padres del
 * LCS: viven con QVS en la barra VS bajo el cuadro.
 * `viaVoltage` mantiene la barra LCS (440 vs 230).
 * 24 V: NORM completa; ALT/AUX tope en MSB-24PWxxxx.
 * 690 / 440 / 230 no se recortan.
 */
function upstreamEdges(
  equipmentId: string,
  viaVoltage?: string | null,
  capAtMsb24 = false,
  /** Mostrar acometidas AUX (solo el nodo objetivo del árbol). */
  includeAuxFeeds = false,
): Circuit[] {
  if (isMainBoardNode(equipmentId)) return []
  // ALT/AUX 24 V: hoja en el cuadro principal 24 V
  if (capAtMsb24 && isMsb24Equipment(equipmentId)) return []

  const all = system690.circuits.filter(
    (c) =>
      c.destinationId === equipmentId &&
      !isGeneratorSide(c) &&
      !isParallelLcsTopFeed(c),
  )
  const real = all
    .filter((c) => !c.virtual)
    .sort((a, b) => {
      if (a.lineType === b.lineType) {
        return a.protectionName.localeCompare(b.protectionName, undefined, {
          numeric: true,
        })
      }
      return a.lineType === 'normal' ? -1 : 1
    })
  let base = real.length > 0 ? real : all.filter((c) => c.virtual)
  // No abrir AUX en nodos intermedios (solo en el equipo buscado)
  if (!includeAuxFeeds && !capAtMsb24) {
    base = base.filter((c) => !isAux24Feed(c))
  }
  return filterFeedsByBusVoltage(base, viaVoltage)
}

/** Padre efectivo de una acometida (AUX → MSB-24). */
function feedParentId(feed: Circuit): string {
  return isAux24Feed(feed)
    ? msb24SourceForAuxOrigin(system690, feed.originId)
    : feed.originId
}

/**
 * Agrupa acometidas con el mismo origen para no duplicar TRF/ABT/MSB
 * (p. ej. QVS-440 + QVS-230 desde el mismo TRF hacia un LCS).
 * Las salidas LCS (barra VS…) se dejan cada una aparte.
 */
function groupFeedsBySharedOrigin(feeds: Circuit[]): {
  parentId: string
  feeds: Circuit[]
}[] {
  const groups: { parentId: string; feeds: Circuit[] }[] = []
  const indexByKey = new Map<string, number>()
  for (const feed of feeds) {
    if (isLcsOutletFeed(feed)) {
      groups.push({ parentId: feedParentId(feed), feeds: [feed] })
      continue
    }
    const parentId = feedParentId(feed)
    const existing = indexByKey.get(parentId)
    if (existing != null) {
      groups[existing]!.feeds.push(feed)
    } else {
      indexByKey.set(parentId, groups.length)
      groups.push({ parentId, feeds: [feed] })
    }
  }
  // QVS dual: 230 a la izquierda, 440 a la derecha (como LCS plegado)
  for (const g of groups) {
    if (g.feeds.length > 1 && g.feeds.every((f) => isTrfToLcsQvsFeed(f))) {
      g.feeds.sort((a, b) => {
        const rank = (c: Circuit) =>
          /230/i.test(c.protectionName)
            ? 0
            : /440/i.test(c.protectionName)
              ? 1
              : 2
        return (
          rank(a) - rank(b) ||
          a.protectionName.localeCompare(b.protectionName, 'es')
        )
      })
    }
  }
  return groups
}

function FeedLeg({
  feed,
  flowing,
  reportMode,
  protectionStatus,
  lockedCircuits,
  onBreaker,
  onHoverInfo,
  onHoverInfoEnd,
  /** Cable solo (p. ej. TRF→LCS; QVS se muestra bajo el LCS). */
  forceThru,
}: {
  feed: Circuit
  flowing: boolean
  reportMode?: boolean
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  forceThru?: boolean
}) {
  const isAlt = feed.lineType === 'alternativa'
  const thru = forceThru || isThruFeed(feed)
  const feedIsAux = isAux24Feed(feed)
  const feedVProps = forceThru
    ? dataFlowVoltageProps(feed.originId)
    : dataFlowVoltageFromCircuit(feed)
  return (
    <div
      className={`stree-branch__leg${flowing ? ' stree-branch__leg--flow' : ''}`}
      {...feedVProps}
    >
      <div className="stree-branch__wire" aria-hidden />
      {!feed.virtual && !thru ? (
        <>
          <BreakerMini
            circuit={feed}
            state={protectionStatus[feed.id]}
            locked={lockedCircuits.has(feed.id)}
            flowing={flowing}
            onClick={(e) => onBreaker(feed, e)}
            onHoverInfo={reportMode ? undefined : onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
          <span
            className={`stree-branch__tag${isAlt ? ' stree-branch__tag--alt' : ''}${feedIsAux ? ' stree-branch__tag--aux' : ''}`}
          >
            {feedIsAux ? 'AUX' : lineBadge(feed.lineType)}
          </span>
        </>
      ) : feed.virtual ? (
        <span className="stree-branch__bus" title="Enlace de barra">
          barra
        </span>
      ) : (
        <div
          className="stree-branch__wire stree-branch__wire--thru"
          title={
            isTrfToLcsQvsFeed(feed)
              ? 'Enlace TRF → LCS'
              : 'Enlace ABT → transformador'
          }
          aria-hidden
        />
      )}
      <div
        className={`stree-branch__wire stree-branch__wire--foot${
          isAlt ? ' stree-branch__wire--alt' : ''
        }`}
        aria-hidden
      />
    </div>
  )
}

function BreakerMini({
  circuit,
  state,
  locked,
  flowing,
  orientation = 'vertical',
  onClick,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  circuit: Circuit
  state?: ProtectionState
  locked?: boolean
  flowing?: boolean
  orientation?: 'vertical' | 'horizontal'
  onClick: (e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const hoverTimer = useRef<number | null>(null)
  const isMotor = isMotorizedProtectionModel(
    circuit.protectionModel,
    circuit.protectionName,
  )

  const clearHoverTimer = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  useEffect(() => () => clearHoverTimer(), [])

  return (
    <button
      type="button"
      className={`casc-brk casc-brk--compact${state ? ` casc-brk--${state}` : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}${isMotor ? '' : ' casc-brk--manual'}${orientation === 'horizontal' ? ' casc-brk--horizontal' : ''}`}
      data-circuit-id={circuit.id}
      onClick={onClick}
      aria-label={`${circuit.protectionName} · ${isMotor ? 'motorizado' : 'manual'} · ${circuit.lineType}`}
      title={
        onHoverInfo
          ? undefined
          : `${circuit.protectionName} · ${isMotor ? 'motorizado' : 'manual'}`
      }
      onMouseEnter={(e) => {
        if (!onHoverInfo) return
        clearHoverTimer()
        const el = e.currentTarget
        hoverTimer.current = window.setTimeout(() => {
          onHoverInfo(circuit, el.getBoundingClientRect())
        }, HOVER_DELAY_MS)
      }}
      onMouseLeave={() => {
        clearHoverTimer()
        onHoverInfoEnd?.()
      }}
    >
      <span className="casc-brk__sym">
        {isMotor ? (
          <MotorizedBreakerSymbol state={state} orientation={orientation} />
        ) : (
          <ManualBreakerSymbol state={state} orientation={orientation} />
        )}
      </span>
      {locked && <LockBadge />}
      <span className="casc-brk__name">{circuit.protectionName}</span>
    </button>
  )
}

function EquipCard({
  equipment,
  live,
  highlight,
  compact,
  /** MSB-24 en rama ALT/AUX: doble clic para expandir/plegar aguas arriba. */
  capExpandable,
  capExpanded,
  onToggleCapExpand,
}: {
  equipment: Equipment
  live?: boolean
  highlight?: boolean
  compact?: boolean
  capExpandable?: boolean
  capExpanded?: boolean
  onToggleCapExpand?: () => void
}) {
  const [eqHover, setEqHover] = useState(false)
  const [showEqBalloon, setShowEqBalloon] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const feeds = useMemo(
    () => incomingFeeds(system690, equipment.id),
    [equipment.id],
  )
  const feedSummaries = useMemo(
    () =>
      feeds.map((f) => ({
        name: f.protectionName,
        lineType: f.lineType,
        originId: f.originId,
      })),
    [feeds],
  )

  useEffect(() => {
    if (!eqHover) {
      setShowEqBalloon(false)
      return
    }
    const t = window.setTimeout(() => setShowEqBalloon(true), HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [eqHover])

  return (
    <div
      ref={wrapRef}
      className={`stree-eq${compact ? ' stree-eq--compact' : ''}${live ? ' stree-eq--live' : ''}${highlight ? ' stree-eq--target' : ''}${capExpandable ? ' stree-eq--cap' : ''}${capExpanded ? ' stree-eq--cap-open' : ''}`}
      data-equip={equipment.id}
      aria-label={
        capExpandable
          ? capExpanded
            ? 'Doble clic para plegar la rama ALT/AUX 24 V'
            : 'Doble clic para expandir aguas arriba (ALT/AUX 24 V)'
          : undefined
      }
      onMouseEnter={() => setEqHover(true)}
      onMouseLeave={() => setEqHover(false)}
      onDoubleClick={(e) => {
        if (!capExpandable || !onToggleCapExpand) return
        e.preventDefault()
        e.stopPropagation()
        setShowEqBalloon(false)
        onToggleCapExpand()
      }}
    >
      <span className="stree-eq__sym">{symbolFor(equipment.kind)}</span>
      <strong className="stree-eq__id">{equipment.id}</strong>
      {(() => {
        const secondary = labelSecondaryDenom(equipment)
        return secondary ? (
          <span className="stree-eq__dcp" title={secondary.title}>
            {secondary.value}
          </span>
        ) : null
      })()}
      {!compact && <span className="stree-eq__name">{equipment.name}</span>}
      {capExpandable && (
        <span className="stree-eq__cap-hint" aria-hidden>
          {capExpanded ? '▴' : '▾'}
        </span>
      )}
      {showEqBalloon && (
        <EquipmentBalloon
          equipment={equipment}
          feeds={feedSummaries}
          circuits={feeds}
          anchorRef={wrapRef}
        />
      )}
    </div>
  )
}

function symbolFor(kind: Equipment['kind']): ReactNode {
  switch (kind) {
    case 'generador':
      return 'G'
    case 'conversion':
      return 'T'
    case 'cuadro_principal':
      return '▣'
    case 'cuadro_secundario':
      return '▦'
    default:
      return 'M'
  }
}

type BreakerHandlers = {
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}

function RailBreaker({
  circuit,
  handlers,
}: {
  circuit: Circuit
  handlers: BreakerHandlers
}) {
  return (
    <BreakerMini
      circuit={circuit}
      state={handlers.protectionStatus[circuit.id]}
      locked={handlers.lockedCircuits.has(circuit.id)}
      flowing={handlers.energizedCircuitIds.has(circuit.id)}
      onClick={(e) => handlers.onBreaker(circuit, e)}
      onHoverInfo={handlers.onHoverInfo}
      onHoverInfoEnd={handlers.onHoverInfoEnd}
    />
  )
}

/** Etiqueta a la izquierda de la barra; el stem baja centrado por la pista (sin cortar). */
function LcsBusRow({
  label,
  voltage,
  tagMod,
  dual,
}: {
  label: string
  voltage: string
  tagMod?: 'vm' | 'nv'
  dual?: boolean
}) {
  return (
    <div
      className={`stree-lcs-bus${dual ? ' stree-lcs-bus--dual' : ''}`}
      data-voltage={voltage}
      {...dataFlowVoltageFromLcsBus(voltage)}
    >
      <span
        className={`stree-lcs-bus__tag${tagMod ? ` stree-lcs-bus__tag--${tagMod}` : ''}`}
      >
        {label}
      </span>
      <div className="stree-lcs-bus__bar" title={label} aria-hidden />
      <div className="stree-branch__wire stree-lcs-bus__stem" aria-hidden />
    </div>
  )
}

function useLcsOutletPath(outlet: Circuit) {
  return useMemo(() => {
    const board = buildLcsBoardModel(system690, outlet.originId)
    if (!board) return null
    const want = normalizeLcsBusVoltage(outlet.voltage)
    const bus =
      board.buses.find((b) => b.voltage === want) ??
      board.buses.find((b) => b.incoming.protectionName === `QVS-${want}`)
    if (!bus) return null
    const service = (outlet.service ?? 'VS') as ServiceClass
    return { bus, service, voltage: bus.voltage }
  }, [outlet])
}

/**
 * Acometida a una salida LCS (440 V o 230 V): LCS→QVS y, si hay, CSB→QS
 * como pares independientes sobre la misma barra VS (CSB no cuelga del LCS).
 * Cascada VS → QVM → VM → QNV → NV según el servicio; sin cartel NORM en la salida.
 */
function LcsOutletBranch({
  outlet,
  viaVoltage,
  capAtMsb24 = false,
  visited,
  expandedCapIds,
  onToggleCapExpand,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
  onHoverInfo,
  onHoverInfoEnd,
  reportMode,
}: {
  outlet: Circuit
  viaVoltage?: string | null
  capAtMsb24?: boolean
  visited: Set<string>
  expandedCapIds: ReadonlySet<string>
  onToggleCapExpand: (id: string) => void
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  reportMode?: boolean
}) {
  const path = useLcsOutletPath(outlet)
  const handlers: BreakerHandlers = {
    protectionStatus,
    lockedCircuits,
    energizedCircuitIds,
    onBreaker,
    onHoverInfo,
    onHoverInfoEnd,
  }

  if (!path) {
    const outletFlow = energizedCircuitIds.has(outlet.id)
    return (
      <>
        <TreeNode
          equipmentId={outlet.originId}
          viaVoltage={outlet.voltage ?? viaVoltage}
          capAtMsb24={capAtMsb24}
          visited={visited}
          expandedCapIds={expandedCapIds}
          onToggleCapExpand={onToggleCapExpand}
          protectionStatus={protectionStatus}
          lockedCircuits={lockedCircuits}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          onBreaker={onBreaker}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          reportMode={reportMode}
        />
        <div
          className={`stree-branch__leg${outletFlow ? ' stree-branch__leg--flow' : ''}`}
          {...dataFlowVoltageFromCircuit(outlet)}
        >
          <div className="stree-branch__wire" aria-hidden />
          <BreakerMini
            circuit={outlet}
            state={protectionStatus[outlet.id]}
            locked={lockedCircuits.has(outlet.id)}
            flowing={outletFlow}
            onClick={(e) => onBreaker(outlet, e)}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
          />
        </div>
      </>
    )
  }

  const { bus, service, voltage } = path
  const parallel = bus.parallelIncoming
  const vmBrk = bus.sections.find((s) => s.service === 'VM')?.sectionBreaker
  const nvBrk = bus.sections.find((s) => s.service === 'NV')?.sectionBreaker
  const needVm = service === 'VM' || service === 'NV'
  const needNv = service === 'NV'
  const vLabel = `${voltage} V`
  const dualFeeds = !!parallel
  const busFlowProps = dataFlowVoltageFromLcsBus(voltage)
  const qvsFlow = energizedCircuitIds.has(bus.incoming.id)
  const parallelFlow = !!(
    parallel && energizedCircuitIds.has(parallel.circuit.id)
  )
  const outletFlow = energizedCircuitIds.has(outlet.id)

  return (
    <div
      className={`stree-lcs-infeed${dualFeeds ? ' stree-lcs-infeed--dual' : ''}${outletFlow ? ' stree-lcs-infeed--flow' : ''}`}
      data-voltage={voltage}
      data-service={service}
      {...busFlowProps}
    >
      <div className="stree-lcs-infeed__parents">
        <div
          className={`stree-lcs-infeed__leg${qvsFlow ? ' stree-lcs-infeed__leg--flow' : ''}`}
          {...dataFlowVoltageFromCircuit(bus.incoming)}
        >
          <TreeNode
            equipmentId={outlet.originId}
            viaVoltage={outlet.voltage ?? viaVoltage}
            capAtMsb24={capAtMsb24}
            visited={visited}
            expandedCapIds={expandedCapIds}
            onToggleCapExpand={onToggleCapExpand}
            protectionStatus={protectionStatus}
            lockedCircuits={lockedCircuits}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            onBreaker={onBreaker}
            onHoverInfo={onHoverInfo}
            onHoverInfoEnd={onHoverInfoEnd}
            reportMode={reportMode}
          />
          <div className="stree-branch__wire" aria-hidden />
          <RailBreaker circuit={bus.incoming} handlers={handlers} />
          <div className="stree-branch__wire stree-lcs-infeed__to-bus" aria-hidden />
        </div>

        {parallel && (
          <div
            className={`stree-lcs-infeed__leg stree-lcs-infeed__leg--parallel${parallelFlow ? ' stree-lcs-infeed__leg--flow' : ''}`}
            {...dataFlowVoltageFromCircuit(parallel.circuit)}
          >
            <EquipCard
              equipment={parallel.equipment}
              live={energizedEquipmentIds.has(parallel.equipment.id)}
            />
            <div className="stree-branch__wire" aria-hidden />
            <RailBreaker circuit={parallel.circuit} handlers={handlers} />
            <div className="stree-branch__wire stree-lcs-infeed__to-bus" aria-hidden />
          </div>
        )}
      </div>

      {/* VS → (QVM) → VM → (QNV) → NV → salida; interruptores entre barras */}
      <LcsBusRow
        label={`VS ${vLabel}`}
        voltage={voltage}
        dual={dualFeeds}
      />

      {needVm && vmBrk && (
        <>
          <RailBreaker circuit={vmBrk} handlers={handlers} />
          <div className="stree-branch__wire stree-lcs-infeed__section-wire" aria-hidden />
          <LcsBusRow
            label={`VM ${vLabel}`}
            voltage={voltage}
            tagMod="vm"
            dual={dualFeeds}
          />
        </>
      )}

      {needNv && nvBrk && (
        <>
          <RailBreaker circuit={nvBrk} handlers={handlers} />
          <div className="stree-branch__wire stree-lcs-infeed__section-wire" aria-hidden />
          <LcsBusRow
            label={`NV ${vLabel}`}
            voltage={voltage}
            tagMod="nv"
            dual={dualFeeds}
          />
        </>
      )}

      <BreakerMini
        circuit={outlet}
        state={protectionStatus[outlet.id]}
        locked={lockedCircuits.has(outlet.id)}
        flowing={energizedCircuitIds.has(outlet.id)}
        onClick={(e) => onBreaker(outlet, e)}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
      />
      <div className="stree-branch__wire stree-branch__wire--foot" aria-hidden />
    </div>
  )
}

/** Tensión de circulación para barra de unión (origen o primer circuito conocido). */
function flowVoltageForStartupDests(
  destinations: StartupDestination[],
  fallbackEquipmentId: string,
): { 'data-flow-v': FlowVoltage } {
  for (const d of destinations) {
    const c = d.circuitId
      ? system690.circuits.find((x) => x.id === d.circuitId)
      : undefined
    if (c) return dataFlowVoltageFromCircuit(c)
  }
  if (destinations[0])
    return dataFlowVoltageProps(destinations[0].equipmentId)
  return dataFlowVoltageProps(fallbackEquipmentId)
}

/** Bajantes colgando de una barra (sin tronco extra). */
function DownstreamBranchList({
  destinations,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
  onHoverInfo,
  onHoverInfoEnd,
  reportMode,
  attachToBus = false,
  flowVoltage,
}: {
  destinations: StartupDestination[]
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  reportMode?: boolean
  /** En carril LCS: la barra ya está arriba, sin stem/join. */
  attachToBus?: boolean
  /** Tensión del origen (MSB/LCS/…): colorea barra de unión dual, no NORM/ALT. */
  flowVoltage?: { 'data-flow-v': FlowVoltage }
}) {
  if (destinations.length === 0) return null
  const dual = destinations.length > 1
  return (
    <div
      className={`stree-downstream stree-downstream--from-rail${attachToBus ? ' stree-downstream--attach-bus' : ''}${dual ? ' stree-downstream--dual' : ''}`}
      {...(flowVoltage ?? {})}
    >
      {!attachToBus && !dual && (
        <div className="stree-branch__wire stree-downstream__stem" aria-hidden />
      )}
      {!attachToBus && dual && (
        <>
          <div
            className="stree-branch__wire stree-downstream__stem"
            aria-hidden
            {...(flowVoltage ?? {})}
          />
          <div
            className="stree-join stree-downstream__join"
            aria-hidden
            {...(flowVoltage ?? {})}
          />
        </>
      )}
      <div className="stree-downstream__branch-row">
        {destinations.map((dest) => {
          const equipment = eqById(dest.equipmentId)
          const circuit = dest.circuitId
            ? system690.circuits.find((c) => c.id === dest.circuitId)
            : undefined
          const isAlt = dest.lineType === 'alternativa'
          const flowing = !!(circuit && energizedCircuitIds.has(circuit.id))
          if (!equipment) return null
          const flowProps = circuit
            ? dataFlowVoltageFromCircuit(circuit)
            : dataFlowVoltageProps(equipment.id)
          return (
            <div
              key={dest.equipmentId}
              className={`stree-branch stree-branch--down${isAlt ? ' stree-branch--alt' : ' stree-branch--norm'}${flowing ? ' stree-branch--flow' : ''}`}
              {...flowProps}
            >
              <div
                className={`stree-branch__leg${flowing ? ' stree-branch__leg--flow' : ''}`}
                {...flowProps}
              >
                <div className="stree-branch__wire" aria-hidden />
                {circuit && dest.protectionName !== '—' ? (
                  <>
                    <BreakerMini
                      circuit={circuit}
                      state={protectionStatus[circuit.id]}
                      locked={lockedCircuits.has(circuit.id)}
                      flowing={flowing}
                      onClick={(e) => onBreaker(circuit, e)}
                      onHoverInfo={reportMode ? undefined : onHoverInfo}
                      onHoverInfoEnd={onHoverInfoEnd}
                    />
                    <span
                      className={`stree-branch__tag${isAlt ? ' stree-branch__tag--alt' : ''}`}
                    >
                      {lineBadge(dest.lineType)}
                    </span>
                  </>
                ) : (
                  <div
                    className="stree-branch__wire stree-branch__wire--thru"
                    aria-hidden
                  />
                )}
                <div
                  className={`stree-branch__wire stree-branch__wire--foot${isAlt ? ' stree-branch__wire--alt' : ''}`}
                  aria-hidden
                />
              </div>
              <EquipCard
                equipment={equipment}
                live={energizedEquipmentIds.has(equipment.id)}
                compact={reportMode}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function partitionLcsDestinations(destinations: StartupDestination[]): {
  v440: StartupDestination[]
  v230: StartupDestination[]
  other: StartupDestination[]
} {
  const v440: StartupDestination[] = []
  const v230: StartupDestination[] = []
  const other: StartupDestination[] = []
  for (const d of destinations) {
    const c = d.circuitId
      ? system690.circuits.find((x) => x.id === d.circuitId)
      : undefined
    const v = normalizeLcsBusVoltage(c?.voltage)
    if (v === '440') v440.push(d)
    else if (v === '230') v230.push(d)
    else other.push(d)
  }
  return { v440, v230, other }
}

function groupDestsByService(destinations: StartupDestination[]): {
  vs: StartupDestination[]
  vm: StartupDestination[]
  nv: StartupDestination[]
} {
  const vs: StartupDestination[] = []
  const vm: StartupDestination[] = []
  const nv: StartupDestination[] = []
  for (const d of destinations) {
    const c = d.circuitId
      ? system690.circuits.find((x) => x.id === d.circuitId)
      : undefined
    const s = (c?.service ?? 'VS') as ServiceClass
    if (s === 'NV') nv.push(d)
    else if (s === 'VM') vm.push(d)
    else vs.push(d)
  }
  return { vs, vm, nv }
}

type TreeBreakerShared = {
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  reportMode?: boolean
}

function TreeRailTie({
  circuit,
  flowing,
  mod,
  ...shared
}: {
  circuit: Circuit
  flowing: boolean
  mod: 'qvm' | 'qnv'
} & Pick<
  TreeBreakerShared,
  | 'protectionStatus'
  | 'lockedCircuits'
  | 'onBreaker'
  | 'onHoverInfo'
  | 'onHoverInfoEnd'
  | 'reportMode'
>) {
  return (
    <div className={`lcs440-tie lcs440-rail__${mod}${flowing ? ' lcs440-tie--flow' : ''}`}>
      <span className="lcs440-tie__bridge lcs440-tie__bridge--left" aria-hidden />
      <BreakerMini
        circuit={circuit}
        state={shared.protectionStatus[circuit.id]}
        locked={shared.lockedCircuits.has(circuit.id)}
        flowing={flowing}
        orientation="horizontal"
        onClick={(e) => shared.onBreaker(circuit, e)}
        onHoverInfo={shared.reportMode ? undefined : shared.onHoverInfo}
        onHoverInfoEnd={shared.onHoverInfoEnd}
      />
      <span className="lcs440-tie__bridge lcs440-tie__bridge--right" aria-hidden />
    </div>
  )
}

/** Carril LCS en árbol: misma rejilla que el unifilar (lcs440-rail). */
function LcsTreeVoltageRail({
  voltage,
  mirror,
  qvs,
  qvsFlow,
  showVm,
  showNv,
  vmBrk,
  nvBrk,
  bySvc,
  dualFan,
  ...shared
}: {
  voltage: '230' | '440'
  mirror: boolean
  qvs?: Circuit
  qvsFlow: boolean
  showVm: boolean
  showNv: boolean
  vmBrk?: Circuit
  nvBrk?: Circuit
  bySvc: ReturnType<typeof groupDestsByService>
  /** 230+440: bajante común LCS + tramos horizontales hacia cada QVS. */
  dualFan?: boolean
} & TreeBreakerShared) {
  const vLabel = `${voltage} V`
  const layout =
    !showVm ? 'vs-only' : !showNv ? 'vs-vm' : ('full' as const)
  const dropShared = { ...shared, attachToBus: true as const }
  const flowProps = dataFlowVoltageFromLcsBus(voltage)

  const vsBlock = (
    <>
      <span className="lcs440-cell__tag lcs440-cell__tag--VS lcs440-rail__vs-tag">
        VS {vLabel}
      </span>
      <div className="lcs440-cell__bus lcs440-rail__vs-bus" aria-hidden />
      <div className="lcs440-rail__vs-drops">
        <DownstreamBranchList
          destinations={bySvc.vs}
          flowVoltage={flowProps}
          {...dropShared}
        />
      </div>
    </>
  )

  const qvmBlock =
    showVm && vmBrk ? (
      <TreeRailTie
        circuit={vmBrk}
        flowing={shared.energizedCircuitIds.has(vmBrk.id)}
        mod="qvm"
        {...shared}
      />
    ) : showVm ? (
      <div className="lcs440-tie lcs440-rail__qvm" aria-hidden />
    ) : null

  const vmBlock = showVm ? (
    <>
      <span className="lcs440-cell__tag lcs440-cell__tag--VM lcs440-rail__vm-tag">
        VM {vLabel}
      </span>
      <div className="lcs440-cell__bus lcs440-rail__vm-bus" aria-hidden />
      <div className="lcs440-rail__vm-drops">
        <DownstreamBranchList
          destinations={bySvc.vm}
          flowVoltage={flowProps}
          {...dropShared}
        />
      </div>
    </>
  ) : null

  const qnvBlock =
    showNv && nvBrk ? (
      <TreeRailTie
        circuit={nvBrk}
        flowing={shared.energizedCircuitIds.has(nvBrk.id)}
        mod="qnv"
        {...shared}
      />
    ) : showNv ? (
      <div className="lcs440-tie lcs440-rail__qnv" aria-hidden />
    ) : null

  const nvBlock = showNv ? (
    <>
      <span className="lcs440-cell__tag lcs440-cell__tag--NV lcs440-rail__nv-tag">
        NV {vLabel}
      </span>
      <div className="lcs440-cell__bus lcs440-rail__nv-bus" aria-hidden />
      <div className="lcs440-rail__nv-drops">
        <DownstreamBranchList
          destinations={bySvc.nv}
          flowVoltage={flowProps}
          {...dropShared}
        />
      </div>
    </>
  ) : null

  const qvsLeg = qvs ? (
    <div
      className={`lcs440-rail__qvs-leg${qvsFlow ? ' lcs440-rail__qvs-leg--flow' : ''}`}
      {...dataFlowVoltageFromLcsBus(voltage)}
      data-qvs={voltage}
    >
      <span
        className="lcs440-rail__qvs-leg__wire lcs440-rail__qvs-leg__wire--from"
        aria-hidden
      />
      <BreakerMini
        circuit={qvs}
        state={shared.protectionStatus[qvs.id]}
        locked={shared.lockedCircuits.has(qvs.id)}
        flowing={qvsFlow}
        onClick={(e) => shared.onBreaker(qvs, e)}
        onHoverInfo={shared.reportMode ? undefined : shared.onHoverInfo}
        onHoverInfoEnd={shared.onHoverInfoEnd}
      />
      <span
        className="lcs440-rail__qvs-leg__wire lcs440-rail__qvs-leg__wire--to-bus"
        aria-hidden
      />
    </div>
  ) : null

  return (
    <div
      className={`stree-lcs-rail-wrap${qvs ? ' stree-lcs-rail-wrap--qvs' : ''}${qvsFlow ? ' stree-lcs-rail-wrap--flow' : ''}${dualFan ? ' stree-lcs-rail-wrap--dual-fan' : ''}${mirror ? ' stree-lcs-rail-wrap--mirror' : ''}`}
      {...flowProps}
    >
      <div
        className={`lcs440-rail stree-lcs-rail stree-lcs-rail--${layout}${mirror ? ' lcs440-rail--mirror' : ''}`}
        {...flowProps}
      >
        {qvsLeg}
        {vsBlock}
        {qvmBlock}
        {vmBlock}
        {qnvBlock}
        {nvBlock}
      </div>
    </div>
  )
}

/**
 * Aguas abajo del LCS (como unifilar):
 * LCS → QVS → carril horizontal VS — QVM — VM — QNV — NV (230 espejo).
 * Solo secciones con consumidores (y acopladores necesarios).
 */
function LcsDownstreamRails({
  lcsId,
  destinations,
  ...shared
}: {
  lcsId: string
  destinations: StartupDestination[]
} & TreeBreakerShared) {
  const board = useMemo(
    () => buildLcsBoardModel(system690, lcsId),
    [lcsId],
  )
  const split = useMemo(
    () => partitionLcsDestinations(destinations),
    [destinations],
  )

  const columns: {
    voltage: '230' | '440'
    list: StartupDestination[]
    mirror: boolean
  }[] = []
  if (destinations.length > 0) {
    if (split.v230.length)
      columns.push({ voltage: '230', list: split.v230, mirror: true })
    if (split.v440.length)
      columns.push({ voltage: '440', list: split.v440, mirror: false })
  } else if (board) {
    for (const b of board.buses) {
      if (b.voltage === '230' || b.voltage === '440') {
        columns.push({
          voltage: b.voltage,
          list: [],
          mirror: b.voltage === '230',
        })
      }
    }
  }

  if (columns.length === 0) return null

  const dualFan = columns.length > 1

  return (
    <LcsDownstreamRailsBody
      dualFan={dualFan}
      lcsId={lcsId}
      columns={columns}
      board={board}
      splitOther={split.other}
      shared={shared}
    />
  )
}

/** Centro horizontal de `el` respecto a `ancestor` (layout, sin transform). */
function centerXRelative(el: HTMLElement, ancestor: HTMLElement): number {
  let x = 0
  let node: HTMLElement | null = el
  while (node && node !== ancestor) {
    x += node.offsetLeft
    const parent = node.offsetParent as HTMLElement | null
    if (!parent || !ancestor.contains(parent)) break
    node = parent
  }
  if (node !== ancestor) {
    const er = el.getBoundingClientRect()
    const ar = ancestor.getBoundingClientRect()
    return er.left + er.width / 2 - ar.left
  }
  return x + el.offsetWidth / 2
}

function LcsDownstreamRailsBody({
  dualFan,
  lcsId,
  columns,
  board,
  splitOther,
  shared,
}: {
  dualFan: boolean
  lcsId: string
  columns: {
    voltage: '230' | '440'
    list: StartupDestination[]
    mirror: boolean
  }[]
  board: ReturnType<typeof buildLcsBoardModel>
  splitOther: StartupDestination[]
  shared: TreeBreakerShared
}) {
  const colsRef = useRef<HTMLDivElement>(null)
  const shiftRef = useRef<HTMLDivElement>(null)
  const railsRef = useRef<HTMLDivElement>(null)
  const [fanBar, setFanBar] = useState<{ left: number; width: number } | null>(
    null,
  )
  const [colsShift, setColsShift] = useState(0)
  const [stemLeft, setStemLeft] = useState<number | null>(null)
  const shiftLockedRef = useRef<number | null>(null)

  const colKey = columns.map((c) => c.voltage).join('+')
  const hasQvs = columns.some(
    (c) => board?.buses.find((b) => b.voltage === c.voltage)?.incoming,
  )

  useLayoutEffect(() => {
    shiftLockedRef.current = null
  }, [colKey])

  useLayoutEffect(() => {
    const colsEl = colsRef.current
    const shiftEl = shiftRef.current
    const railsEl = railsRef.current
    if (!colsEl || !shiftEl || !railsEl) return

    const measure = () => {
      const hubEl = railsEl.closest('.stree-node__lcs-hub') as HTMLElement | null
      const lcsEl = hubEl?.querySelector<HTMLElement>('.stree-eq')

      if (dualFan) {
        const legs = colsEl.querySelectorAll<HTMLElement>(
          '.lcs440-rail__qvs-leg',
        )
        if (legs.length < 2) {
          setFanBar(null)
          setColsShift(0)
          setStemLeft(null)
          return
        }
        const first = legs[0]!
        const last = legs[legs.length - 1]!
        const firstCenter = centerXRelative(first, shiftEl)
        const lastCenter = centerXRelative(last, shiftEl)
        const midQvs = (firstCenter + lastCenter) / 2

        if (shiftLockedRef.current == null && lcsEl) {
          const shiftRect = shiftEl.getBoundingClientRect()
          const lcsCenter =
            lcsEl.getBoundingClientRect().left +
            lcsEl.offsetWidth / 2 -
            shiftRect.left
          shiftLockedRef.current = lcsCenter - midQvs
        }

        setColsShift(shiftLockedRef.current ?? 0)
        setFanBar({
          left: Math.min(firstCenter, lastCenter),
          width: Math.abs(lastCenter - firstCenter),
        })
        setStemLeft(midQvs)
        return
      }

      setFanBar(null)
      if (!hubEl || !lcsEl) {
        setColsShift(0)
        setStemLeft(null)
        return
      }
      const qvsLeg = colsEl.querySelector<HTMLElement>('.lcs440-rail__qvs-leg')
      if (!qvsLeg) {
        setColsShift(0)
        setStemLeft(null)
        shiftLockedRef.current = null
        return
      }

      if (shiftLockedRef.current == null) {
        const hubRect = hubEl.getBoundingClientRect()
        const lcsCenter =
          lcsEl.getBoundingClientRect().left +
          lcsEl.offsetWidth / 2 -
          hubRect.left
        const qvsCenter =
          qvsLeg.getBoundingClientRect().left +
          qvsLeg.offsetWidth / 2 -
          hubRect.left
        shiftLockedRef.current = lcsCenter - qvsCenter
      }
      setColsShift(shiftLockedRef.current)
      setStemLeft(centerXRelative(qvsLeg, shiftEl))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(colsEl)
    ro.observe(shiftEl)
    ro.observe(railsEl)
    const hubEl = railsEl.closest('.stree-node__lcs-hub')
    const lcsEl = hubEl?.querySelector('.stree-eq')
    if (lcsEl) ro.observe(lcsEl)
    return () => ro.disconnect()
  }, [dualFan, colKey, shared.energizedCircuitIds, shared.protectionStatus])

  const railsStyle: CSSProperties | undefined = (() => {
    const vars: Record<string, string> = {}
    if (fanBar) {
      vars['--stree-fan-left'] = `${fanBar.left}px`
      vars['--stree-fan-width'] = `${fanBar.width}px`
    }
    if (stemLeft != null) {
      vars['--stree-fan-stem-left'] = `${stemLeft}px`
    }
    return Object.keys(vars).length > 0 ? (vars as CSSProperties) : undefined
  })()

  const shiftStyle: CSSProperties | undefined =
    colsShift !== 0 ? { position: 'relative', left: colsShift } : undefined

  return (
    <div
      ref={railsRef}
      className={`stree-lcs-rails${dualFan ? ' stree-lcs-rails--dual' : ' stree-lcs-rails--single'}`}
      style={railsStyle}
    >
      <div ref={shiftRef} className="stree-lcs-rails__shift" style={shiftStyle}>
        {hasQvs ? (
          <div className="stree-lcs-rails__fan" aria-hidden>
            <div className="stree-lcs-rails__fan-stem" />
            {dualFan ? (
              <div className="stree-lcs-rails__fan-bar" />
            ) : null}
          </div>
        ) : null}
        <div ref={colsRef} className="stree-lcs-rails__cols">
          {columns.map(({ voltage, list, mirror }) => {
            const bus = board?.buses.find((b) => b.voltage === voltage)
            const qvs = bus?.incoming
            const bySvc = groupDestsByService(list)
            const showVm = bySvc.vm.length > 0 || bySvc.nv.length > 0
            const showNv = bySvc.nv.length > 0
            const vmBrk = bus?.sections.find((s) => s.service === 'VM')
              ?.sectionBreaker
            const nvBrk = bus?.sections.find((s) => s.service === 'NV')
              ?.sectionBreaker
            const qvsFlow = !!(qvs && shared.energizedCircuitIds.has(qvs.id))

            return (
              <LcsTreeVoltageRail
                key={voltage}
                voltage={voltage}
                mirror={mirror}
                qvs={qvs}
                qvsFlow={qvsFlow}
                showVm={showVm}
                showNv={showNv}
                vmBrk={vmBrk}
                nvBrk={nvBrk}
                bySvc={bySvc}
                dualFan={dualFan}
                {...shared}
              />
            )
          })}
        </div>
        {splitOther.length > 0 && (
          <DownstreamBranchList
            destinations={splitOther}
            flowVoltage={flowVoltageForStartupDests(splitOther, lcsId)}
            {...shared}
          />
        )}
      </div>
    </div>
  )
}

/** Bajantes desde un origen común hacia los equipos destino (informe arranque). */
function DownstreamDestinations({
  originId,
  destinations,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
  onHoverInfo,
  onHoverInfoEnd,
  reportMode,
}: {
  originId: string
  destinations: StartupDestination[]
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  reportMode?: boolean
}) {
  const shared = {
    protectionStatus,
    lockedCircuits,
    energizedCircuitIds,
    energizedEquipmentIds,
    onBreaker,
    onHoverInfo,
    onHoverInfoEnd,
    reportMode,
  }

  if (isLcsEquipment(originId) && destinations.length > 0) {
    return (
      <LcsDownstreamRails
        lcsId={originId}
        destinations={destinations}
        {...shared}
      />
    )
  }

  const dual = destinations.length > 1
  const flowVoltage = dataFlowVoltageProps(originId)
  return (
    <div
      className={`stree-downstream${dual ? ' stree-downstream--dual' : ''}`}
      {...flowVoltage}
    >
      <div
        className="stree-branch__wire stree-downstream__stem"
        aria-hidden
      />
      <DownstreamBranchList
        destinations={destinations}
        flowVoltage={flowVoltage}
        {...shared}
      />
    </div>
  )
}

function TreeNode({
  equipmentId,
  isTarget,
  viaVoltage,
  /** Rama 24 V ALT/AUX: tope en MSB-24 salvo expansión por doble clic. */
  capAtMsb24 = false,
  visited,
  expandedCapIds,
  onToggleCapExpand,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
  onHoverInfo,
  onHoverInfoEnd,
  hubDownstream,
  reportMode,
}: {
  equipmentId: string
  isTarget?: boolean
  /** Tensión del tramo por el que se llegó (continúa barra 440/230). */
  viaVoltage?: string | null
  capAtMsb24?: boolean
  visited: Set<string>
  expandedCapIds: ReadonlySet<string>
  onToggleCapExpand: (id: string) => void
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  hubDownstream?: StartupDestination[]
  reportMode?: boolean
}) {
  const equipment = eqById(equipmentId)
  const capExpanded =
    capAtMsb24 &&
    isMsb24Equipment(equipmentId) &&
    expandedCapIds.has(equipmentId)
  /** Tope activo hasta que el usuario expande este MSB-24. */
  const effectivelyCapped =
    capAtMsb24 && !(isMsb24Equipment(equipmentId) && capExpanded)
  const feeds = useMemo(
    () =>
      upstreamEdges(equipmentId, viaVoltage, effectivelyCapped, isTarget),
    [equipmentId, viaVoltage, effectivelyCapped, isTarget],
  )

  if (!equipment) return null

  // Evitar ciclos en enlaces de barra / bucles
  if (visited.has(equipmentId) && !isTarget) {
    return (
      <div className="stree-eq stree-eq--ref" title="Ya representado aguas arriba">
        <span className="stree-eq__id">{equipmentId}</span>
      </div>
    )
  }

  const nextVisited = new Set(visited)
  nextVisited.add(equipmentId)

  const feedGroups = groupFeedsBySharedOrigin(feeds)
  const dual = feedGroups.length > 1
  const capExpandable = capAtMsb24 && isMsb24Equipment(equipmentId)

  const lcsDownstream =
    hubDownstream && hubDownstream.length > 0 ? (
      <DownstreamDestinations
        originId={equipmentId}
        destinations={hubDownstream}
        protectionStatus={protectionStatus}
        lockedCircuits={lockedCircuits}
        energizedCircuitIds={energizedCircuitIds}
        energizedEquipmentIds={energizedEquipmentIds}
        onBreaker={onBreaker}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
        reportMode={reportMode}
      />
    ) : isTarget && isLcsEquipment(equipmentId) ? (
      <LcsDownstreamRails
        lcsId={equipmentId}
        destinations={[]}
        protectionStatus={protectionStatus}
        lockedCircuits={lockedCircuits}
        energizedCircuitIds={energizedCircuitIds}
        energizedEquipmentIds={energizedEquipmentIds}
        onBreaker={onBreaker}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
        reportMode={reportMode}
      />
    ) : null

  const lcsHub = !!(lcsDownstream && isLcsEquipment(equipmentId))

  const equipSelf = (
    <div className="stree-node__self">
      <EquipCard
        equipment={equipment}
        live={energizedEquipmentIds.has(equipment.id)}
        highlight={isTarget}
        capExpandable={capExpandable && !reportMode}
        capExpanded={capExpanded}
        onToggleCapExpand={
          capExpandable && !reportMode
            ? () => onToggleCapExpand(equipmentId)
            : undefined
        }
        compact={reportMode && !isTarget}
      />
    </div>
  )

  return (
    <div
      className={`stree-node${isTarget ? ' stree-node--target' : ''}${dual ? ' stree-node--dual' : ''}${feedGroups.length === 1 ? ' stree-node--single' : ''}`}
    >
      {feedGroups.length > 0 && (
        <div
          className={`stree-feed${dual ? ' stree-feed--dual' : ' stree-feed--single'}`}
        >
          <div className="stree-node__parents">
            {feedGroups.map((group) => {
              const primary = group.feeds[0]!
              const fan = group.feeds.length > 1
              const showLcsRail = isLcsOutletFeed(primary)
              const nextCap =
                group.feeds.some((f) => feedCapsAtMsb24(f)) ||
                (capAtMsb24 && !isMsb24Equipment(equipmentId))
              const anyFlow = group.feeds.some((f) =>
                energizedCircuitIds.has(f.id),
              )
              // Varias tensiones desde el mismo origen: no filtrar el padre
              const parentVia = fan
                ? null
                : (primary.voltage ?? viaVoltage)

              if (showLcsRail) {
                const isAlt = primary.lineType === 'alternativa'
                const feedFlow = energizedCircuitIds.has(primary.id)
                const feedVProps = dataFlowVoltageFromCircuit(primary)
                return (
                  <div
                    key={primary.id}
                    className={`stree-branch stree-branch--lcs${isAlt ? ' stree-branch--alt' : ' stree-branch--norm'}${feedFlow ? ' stree-branch--flow' : ''}`}
                    {...feedVProps}
                  >
                    <LcsOutletBranch
                      outlet={primary}
                      viaVoltage={viaVoltage}
                      capAtMsb24={nextCap}
                      visited={nextVisited}
                      expandedCapIds={expandedCapIds}
                      onToggleCapExpand={onToggleCapExpand}
                      protectionStatus={protectionStatus}
                      lockedCircuits={lockedCircuits}
                      energizedCircuitIds={energizedCircuitIds}
                      energizedEquipmentIds={energizedEquipmentIds}
                      onBreaker={onBreaker}
                      onHoverInfo={onHoverInfo}
                      onHoverInfoEnd={onHoverInfoEnd}
                      reportMode={reportMode}
                    />
                  </div>
                )
              }

              const branchAlt = group.feeds.every(
                (f) => f.lineType === 'alternativa',
              )
              const branchAux = group.feeds.every((f) => isAux24Feed(f))
              // TRF→LCS: un solo cable; QVS se pinta bajo el LCS
              const qvsLink =
                isLcsEquipment(equipmentId) &&
                isTrfLcsQvsFeedGroup(group.feeds)

              return (
                <div
                  key={group.feeds.map((f) => f.id).join('+')}
                  className={`stree-branch${branchAlt ? ' stree-branch--alt' : ' stree-branch--norm'}${branchAux ? ' stree-branch--aux' : ''}${fan && !qvsLink ? ' stree-branch--fan' : ''}${anyFlow ? ' stree-branch--flow' : ''}`}
                  {...(qvsLink || (fan && !qvsLink)
                    ? dataFlowVoltageProps(group.parentId)
                    : dataFlowVoltageFromCircuit(primary))}
                >
                  <TreeNode
                    equipmentId={group.parentId}
                    viaVoltage={qvsLink ? null : parentVia}
                    capAtMsb24={nextCap}
                    visited={nextVisited}
                    expandedCapIds={expandedCapIds}
                    onToggleCapExpand={onToggleCapExpand}
                    protectionStatus={protectionStatus}
                    lockedCircuits={lockedCircuits}
                    energizedCircuitIds={energizedCircuitIds}
                    energizedEquipmentIds={energizedEquipmentIds}
                    onBreaker={onBreaker}
                    onHoverInfo={onHoverInfo}
                    onHoverInfoEnd={onHoverInfoEnd}
                    reportMode={reportMode}
                  />
                  {qvsLink ? (
                    <FeedLeg
                      feed={primary}
                      flowing={anyFlow}
                      forceThru
                      reportMode={reportMode}
                      protectionStatus={protectionStatus}
                      lockedCircuits={lockedCircuits}
                      onBreaker={onBreaker}
                      onHoverInfo={onHoverInfo}
                      onHoverInfoEnd={onHoverInfoEnd}
                    />
                  ) : fan ? (
                    <div className="stree-fan stree-fan--split">
                      <div
                        className="stree-fan__exit"
                        aria-hidden
                        {...dataFlowVoltageProps(group.parentId)}
                      />
                      <div className="stree-fan__legs">
                        {group.feeds.map((feed) => (
                          <div
                            key={feed.id}
                            className={`stree-fan__col${feed.lineType === 'alternativa' ? ' stree-fan__col--alt' : ''}`}
                            {...dataFlowVoltageFromCircuit(feed)}
                          >
                            <FeedLeg
                              feed={feed}
                              flowing={energizedCircuitIds.has(feed.id)}
                              reportMode={reportMode}
                              protectionStatus={protectionStatus}
                              lockedCircuits={lockedCircuits}
                              onBreaker={onBreaker}
                              onHoverInfo={onHoverInfo}
                              onHoverInfoEnd={onHoverInfoEnd}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <FeedLeg
                      feed={primary}
                      flowing={energizedCircuitIds.has(primary.id)}
                      reportMode={reportMode}
                      protectionStatus={protectionStatus}
                      lockedCircuits={lockedCircuits}
                      onBreaker={onBreaker}
                      onHoverInfo={onHoverInfo}
                      onHoverInfoEnd={onHoverInfoEnd}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {dual && (
            <>
              <div
                className="stree-join"
                aria-hidden
                {...dataFlowVoltageProps(equipmentId)}
              />
              <div
                className="stree-branch__wire stree-branch__wire--stem"
                aria-hidden
                {...dataFlowVoltageProps(equipmentId)}
              />
            </>
          )}
        </div>
      )}

      {lcsHub ? (
        <div className="stree-node__lcs-hub">
          {equipSelf}
          {lcsDownstream}
        </div>
      ) : (
        <>
          {equipSelf}
          {lcsDownstream}
        </>
      )}
    </div>
  )
}

export function SearchTreeView({
  equipmentId,
  trace,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
  onBreaker,
  hubDownstream,
  reportMode = false,
  showHeader = true,
  groupCaption,
}: SearchTreeViewProps) {
  const direct = upstreamEdges(equipmentId, null, false, true).filter(
    (c) => !c.virtual,
  )
  const realInTrace = trace.circuits.filter(
    (c) => !c.virtual && !isGeneratorSide(c),
  ).length

  const [brkBalloon, setBrkBalloon] = useState<{
    circuit: Circuit
    left: number
    top: number
  } | null>(null)
  /** MSB-24 en ramas ALT/AUX expandidos por doble clic. */
  const [expandedCapIds, setExpandedCapIds] = useState<Set<string>>(
    () => new Set(),
  )

  useEffect(() => {
    setExpandedCapIds(new Set())
  }, [equipmentId])

  const toggleCapExpand = (id: string) => {
    setExpandedCapIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const showBreakerInfo = (circuit: Circuit, rect: DOMRect) => {
    const { x, y } = placeCircuitBalloon(rect)
    setBrkBalloon({
      circuit,
      left: x,
      top: y,
    })
  }

  const noopBreaker = (_c: Circuit, e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const breakerHandler = reportMode ? noopBreaker : onBreaker

  const hasHubLeaves =
    hubDownstream != null && hubDownstream.length > 0

  return (
    <div className={`stree${reportMode ? ' stree--report' : ''}`}>
      {showHeader && (
        <header className="stree__head">
          <h3>Árbol de alimentaciones · {equipmentId}</h3>
          <p>
            Del cuadro principal (MSB-6PWS) hacia abajo, sin generadores ni QG*.
            Los paneles PNL-MSB suben al MSB por el BUS. Misma filosofía en 440 V
            y 230 V: QVS (y QS* paralela, si existe) alimentan VS bajo el LCS;
            QVM/VM y QNV/NV solo si el equipo está en esa barra. En 24 V: NORM
            completa; ALT y AUX hasta el MSB-24PWxxxx (doble clic en ese cuadro
            para expandir aguas arriba). El equipo aparece una sola vez
            {direct.length > 1
              ? ` · ${direct.length} alimentaciones NORM/ALT convergentes`
              : ''}
            . {realInTrace} circuitos reales en la traza.
          </p>
        </header>
      )}

      {groupCaption && (
        <p className="stree__group-caption">{groupCaption}</p>
      )}

      <div className="stree__canvas">
        <TreeNode
          equipmentId={equipmentId}
          isTarget={!hasHubLeaves}
          hubDownstream={hubDownstream}
          reportMode={reportMode}
          visited={new Set()}
          expandedCapIds={expandedCapIds}
          onToggleCapExpand={toggleCapExpand}
          protectionStatus={protectionStatus}
          lockedCircuits={lockedCircuits}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          onBreaker={breakerHandler}
          onHoverInfo={reportMode ? undefined : showBreakerInfo}
          onHoverInfoEnd={reportMode ? undefined : () => setBrkBalloon(null)}
        />
      </div>

      {!reportMode && brkBalloon && (
        <CircuitBalloon
          circuit={brkBalloon.circuit}
          state={protectionStatus[brkBalloon.circuit.id]}
          x={brkBalloon.left}
          y={brkBalloon.top}
          fixed
          onClose={() => setBrkBalloon(null)}
        />
      )}
    </div>
  )
}
