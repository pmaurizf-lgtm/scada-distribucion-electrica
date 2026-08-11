import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { buildLcsBoardModel } from '../abtDownstream/model'
import { system690 } from '../data/system690'
import { useEquipBalloonGesture } from '../hooks/useEquipBalloonGesture'
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
import type { UpstreamTrace } from '../utils/upstream'
import {
  filterFeedsByBusVoltage,
  normalizeLcsBusVoltage,
} from '../utils/upstream'
import { labelSecondaryDenom } from '../utils/equipmentLabels'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
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

/** Enlace continuo sin chip (ABT→…, SBT→SCV o TRF→LCS vía QVS). */
function isThruFeed(circuit: Circuit): boolean {
  return isLinkOnlyOutgoingFeed(circuit) || isTrfToLcsQvsFeed(circuit)
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

function BreakerMini({
  circuit,
  state,
  locked,
  flowing,
  onClick,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  circuit: Circuit
  state?: ProtectionState
  locked?: boolean
  flowing?: boolean
  onClick: (e: ReactMouseEvent) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const hoverTimer = useRef<number | null>(null)

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
      className={`casc-brk casc-brk--compact${state ? ` casc-brk--${state}` : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}`}
      data-circuit-id={circuit.id}
      onClick={onClick}
      aria-label={`${circuit.protectionName} · ${circuit.lineType}`}
      title={onHoverInfo ? undefined : `${circuit.protectionName} · ${circuit.lineType}`}
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
        <MotorizedBreakerSymbol state={state} />
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
  const wrapRef = useRef<HTMLDivElement>(null)
  const { showBalloon, dismissBalloon, balloonBind, expandHint, infoHint } =
    useEquipBalloonGesture()

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

  return (
    <div
      ref={wrapRef}
      className={`stree-eq${compact ? ' stree-eq--compact' : ''}${live ? ' stree-eq--live' : ''}${highlight ? ' stree-eq--target' : ''}${capExpandable ? ' stree-eq--cap' : ''}${capExpanded ? ' stree-eq--cap-open' : ''}`}
      data-equip={equipment.id}
      aria-label={
        capExpandable
          ? capExpanded
            ? `${expandHint} para plegar la rama ALT/AUX 24 V · ${infoHint}`
            : `${expandHint} para expandir aguas arriba (ALT/AUX 24 V) · ${infoHint}`
          : infoHint
      }
      {...balloonBind}
      onDoubleClick={(e) => {
        if (!capExpandable || !onToggleCapExpand) return
        e.preventDefault()
        e.stopPropagation()
        dismissBalloon()
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
      {showBalloon && (
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
        />
        <div className="stree-branch__leg">
          <div className="stree-branch__wire" aria-hidden />
          <BreakerMini
            circuit={outlet}
            state={protectionStatus[outlet.id]}
            locked={lockedCircuits.has(outlet.id)}
            flowing={energizedCircuitIds.has(outlet.id)}
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

  return (
    <div
      className={`stree-lcs-infeed${dualFeeds ? ' stree-lcs-infeed--dual' : ''}`}
      data-voltage={voltage}
      data-service={service}
    >
      <div className="stree-lcs-infeed__parents">
        <div className="stree-lcs-infeed__leg">
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
          />
          <div className="stree-branch__wire" aria-hidden />
          <RailBreaker circuit={bus.incoming} handlers={handlers} />
          <div className="stree-branch__wire stree-lcs-infeed__to-bus" aria-hidden />
        </div>

        {parallel && (
          <div className="stree-lcs-infeed__leg stree-lcs-infeed__leg--parallel">
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

/**
 * Nodo del árbol: padres (aguas arriba) arriba, este equipo abajo.
 * Cada equipo se pinta una sola vez en su posición del árbol.
 */
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

  const dual = feeds.length > 1
  const capExpandable = capAtMsb24 && isMsb24Equipment(equipmentId)

  return (
    <div
      className={`stree-node${isTarget ? ' stree-node--target' : ''}${dual ? ' stree-node--dual' : ''}${feeds.length === 1 ? ' stree-node--single' : ''}`}
    >
      {feeds.length > 0 && (
        <div
          className={`stree-feed${dual ? ' stree-feed--dual' : ' stree-feed--single'}`}
        >
          <div className="stree-node__parents">
            {feeds.map((feed) => {
              const isAlt = feed.lineType === 'alternativa'
              const thru = isThruFeed(feed)
              const showLcsRail = isLcsOutletFeed(feed)
              const feedIsAux = isAux24Feed(feed)
              // Heredar tope ALT/AUX hasta el MSB-24; al expandirlo, NORM (RCT…) sigue completa
              const nextCap =
                feedCapsAtMsb24(feed) ||
                (capAtMsb24 && !isMsb24Equipment(equipmentId))
              // AUX: saltar SSB-24 intermedio → hoja MSB-24PWxxxx
              const parentId = feedIsAux
                ? msb24SourceForAuxOrigin(system690, feed.originId)
                : feed.originId

              if (showLcsRail) {
                return (
                  <div
                    key={feed.id}
                    className={`stree-branch stree-branch--lcs${isAlt ? ' stree-branch--alt' : ' stree-branch--norm'}`}
                  >
                    <LcsOutletBranch
                      outlet={feed}
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
                    />
                  </div>
                )
              }

              return (
                <div
                  key={feed.id}
                  className={`stree-branch${isAlt ? ' stree-branch--alt' : ' stree-branch--norm'}${feedIsAux ? ' stree-branch--aux' : ''}`}
                >
                  <TreeNode
                    equipmentId={parentId}
                    viaVoltage={feed.voltage ?? viaVoltage}
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
                  />
                  <div className="stree-branch__leg">
                    <div className="stree-branch__wire" aria-hidden />
                    {!feed.virtual && !thru ? (
                      <>
                        <BreakerMini
                          circuit={feed}
                          state={protectionStatus[feed.id]}
                          locked={lockedCircuits.has(feed.id)}
                          flowing={energizedCircuitIds.has(feed.id)}
                          onClick={(e) => onBreaker(feed, e)}
                          onHoverInfo={onHoverInfo}
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
                            ? 'Enlace TRF → LCS (QVS en barra VS)'
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
                </div>
              )
            })}
          </div>

          {dual && (
            <>
              <div className="stree-join" aria-hidden />
              <div className="stree-branch__wire stree-branch__wire--stem" aria-hidden />
            </>
          )}
        </div>
      )}

      <div className="stree-node__self">
        <EquipCard
          equipment={equipment}
          live={energizedEquipmentIds.has(equipment.id)}
          highlight={isTarget}
          capExpandable={capExpandable}
          capExpanded={capExpanded}
          onToggleCapExpand={
            capExpandable
              ? () => onToggleCapExpand(equipmentId)
              : undefined
          }
        />
      </div>
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

  return (
    <div className="stree">
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

      <div className="stree__canvas">
        <TreeNode
          equipmentId={equipmentId}
          isTarget
          visited={new Set()}
          expandedCapIds={expandedCapIds}
          onToggleCapExpand={toggleCapExpand}
          protectionStatus={protectionStatus}
          lockedCircuits={lockedCircuits}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          onBreaker={onBreaker}
          onHoverInfo={showBreakerInfo}
          onHoverInfoEnd={() => setBrkBalloon(null)}
        />
      </div>

      {brkBalloon && (
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
