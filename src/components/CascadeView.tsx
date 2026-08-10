import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import {
  boardFromOrigin,
  buildBoardModels,
  busTieCircuits,
  childFeeders,
  feedScopedChildFeeders,
  incomingFeeds,
  isUnifilarLinkOnlyFeed,
  isAux24Feed,
  isPendingFeed,
  aux24FeedsForEquipment,
  aux24JumpRevealId,
  nestableChildFeeders,
  type BoardId,
  type BoardModel,
  type BusHalf,
  type FeederOutlet,
} from '../utils/cascadeModel'
import type { UpstreamTrace } from '../utils/upstream'
import { getPlantRevealPath } from '../utils/upstream'
import {
  isLcsEquipment,
  isTrfWithLoadCenter,
  trfLoadCenterFeed,
  windingNotesForTrf,
} from '../abtDownstream'
import { isMsb4Sfs } from '../voltageSystems/hz400'
import { Msb4SfsBoardView } from './Msb4SfsBoardView'
import {
  hasSsbBoardLayout,
  isSsb115InternalBus,
  isSsbIncomingCircuit,
} from '../abtDownstream/ssbBoard'
import { isSsb2Pws2209 } from '../abtDownstream/ssb2pws2209'
import { Aux24Incoming } from './Aux24Incoming'
import { CircuitBalloon, placeCircuitBalloon } from './CircuitBalloon'
import { EquipmentBalloon } from './EquipmentBalloon'
import { BreakerChip } from './BreakerChip'
import {
  EquipmentBusDrop,
  equipFamOf,
} from './EquipmentBusDrop'
import { LcsDualView } from './LcsDualView'
import { SearchTreeView } from './SearchTreeView'
import { SsbBoardView } from './SsbBoardView'

export type LockTool = 'none' | 'lock' | 'unlock'

export type CascadeViewHandle = {
  expandAll: () => void
  collapseAll: () => void
  /** Restaura zoom/expansión/scroll previos a localizar o saltar a remoto. */
  goBack: () => void
}

export interface CascadeFocus {
  equipmentId: string
  trace: UpstreamTrace
}

interface CascadeViewProps {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  energizedBusHalves: Map<string, Set<'SA' | 'SB'>>
  runningGenerators: Set<string>
  lockedCircuits: Set<string>
  lockTool: LockTool
  zoom: number
  onZoomChange: (zoom: number) => void
  /** Vista árbol de alimentaciones (buscador secundario). */
  focus: CascadeFocus | null
  /** Localizar equipo en el unifilar (buscador principal). */
  locateEquipmentId: string | null
  onToggleProtection: (circuitId: string) => boolean | void
  onLockCircuit: (circuitId: string) => void
  onUnlockCircuit: (circuitId: string) => void
  onToggleGenerator: (genId: string) => void
  onClearFocus?: () => void
  onClearLocate?: () => void
}

const MSB_BOARD_IDS = ['MSB-6PWS0002', 'MSB-6PWS0001'] as const

type PlantViewSnapshot = {
  boards: string[]
  equip: string[]
  zoom: number
  scrollLeft: number
  scrollTop: number
}

/** Equipos del unifilar que admiten despliegue (cadena / LCS / SSB / paneles). */
function allPlantExpandEquipIds(): string[] {
  const ids = new Set<string>()
  for (const e of system690.equipment) {
    if (
      e.id.startsWith('MSB-') ||
      e.id === 'ORIGEN-PENDIENTE' ||
      e.kind === 'generador'
    ) {
      continue
    }
    if (
      hasSsbBoardLayout(e) ||
      isSsb115InternalBus(e) ||
      /^(ABT|TRF|LCS|SSB|CCM|FAC|FCP|FUP|UCP|UPS)-/i.test(e.id)
    ) {
      ids.add(e.id)
    }
  }
  return [...ids]
}

function halfTag(boardId: string, half: BusHalf): string {
  const n = boardId.endsWith('1') ? '1' : '2'
  return `${n}${half}`
}

function GenSymbol({
  short,
  title,
  running,
  onToggle,
  equipmentId,
  located = false,
}: {
  short: string
  title: string
  running: boolean
  onToggle: () => void
  equipmentId?: string
  located?: boolean
}) {
  return (
    <button
      type="button"
      className={`casc-gen${running ? ' casc-gen--running' : ''}${located ? ' casc-gen--locate' : ''}`}
      data-equip={equipmentId}
      data-locate={located ? '1' : undefined}
      title={`${title} · ${running ? 'EN MARCHA (clic para parar)' : 'PARADO (clic para arrancar)'}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(e) => {
        // Evitar que el doble clic pliegue el cuadro MSB
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <svg viewBox="0 0 56 70" className="casc-gen__svg" aria-hidden>
        <line
          x1="28"
          y1="2"
          x2="28"
          y2="12"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx="28"
          cy="34"
          r="18"
          fill={running ? 'rgba(230, 194, 0, 0.2)' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        />
        <text
          x="28"
          y="39"
          textAnchor="middle"
          fontSize="16"
          fontFamily="IBM Plex Sans, sans-serif"
          fontWeight="600"
          fill="currentColor"
        >
          G
        </text>
        <line
          x1="28"
          y1="52"
          x2="28"
          y2="68"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <span className="casc-gen__label">{short}</span>
      <span className="casc-gen__state">{running ? 'ON' : 'OFF'}</span>
    </button>
  )
}

/** Candado rojo solo cuando el interruptor está bloqueado (LOTO) — ver BreakerChip.tsx */

function HorizontalBus({
  label,
  voltage = 'salidas',
  items,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  expandedEquip,
  onToggleEquip,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
  nested,
  /** Cadena ABT/TRF/LCS: sin barra horizontal; recuadro → interruptor → hijo */
  direct,
  focusCircuitIds,
  locateEquipmentId,
}: {
  label: string
  voltage?: string
  items: { key: string; circuit: Circuit; equipment: Equipment }[]
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  expandedEquip: Set<string>
  onToggleEquip: (id: string) => void
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  nested?: boolean
  direct?: boolean
  focusCircuitIds?: Set<string> | null
  locateEquipmentId?: string | null
}) {
  const list = focusCircuitIds
    ? items.filter((it) => focusCircuitIds.has(it.circuit.id))
    : items

  return (
    <div
      className={`hbus${nested ? ' hbus--nested' : ''}${direct ? ' hbus--direct' : ''}`}
    >
      {!direct && (
        <>
          <div className="hbus__title">
            <strong>{label}</strong>
            <span>{voltage}</span>
          </div>
          <div className="hbus__rail-wrap" aria-hidden>
            <div className="hbus__rail" />
          </div>
        </>
      )}
      <div className="hbus__drops">
        {list.map((item) => (
          <div key={item.key} className="hbus__slot">
            <BusDrop
              circuit={item.circuit}
              equipment={item.equipment}
              protectionStatus={protectionStatus}
              energizedCircuitIds={energizedCircuitIds}
              energizedEquipmentIds={energizedEquipmentIds}
              lockedCircuits={lockedCircuits}
              expanded={expandedEquip.has(item.equipment.id)}
              expandedEquip={expandedEquip}
              onToggleEquip={onToggleEquip}
              onLocalBreaker={onLocalBreaker}
              onJumpToCircuit={onJumpToCircuit}
              onHoverInfo={onHoverInfo}
              onHoverInfoEnd={onHoverInfoEnd}
              focusCircuitIds={focusCircuitIds}
              locateEquipmentId={locateEquipmentId}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function BusDrop({
  circuit,
  equipment,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  expanded,
  expandedEquip,
  onToggleEquip,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
  focusCircuitIds,
  locateEquipmentId,
}: {
  circuit: Circuit
  equipment: Equipment
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  expanded: boolean
  expandedEquip: Set<string>
  onToggleEquip: (id: string) => void
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  focusCircuitIds?: Set<string> | null
  locateEquipmentId?: string | null
}) {
  const children = useMemo(() => {
    // AUX 24 V → LCS/MSB: no desarrollar el cuadro bajo el alimentador 24 V
    if (isAux24Feed(circuit)) return []
    if (isLcsEquipment(equipment.id)) return []
    if (isTrfWithLoadCenter(system690, equipment.id)) {
      const feed = trfLoadCenterFeed(system690, equipment.id)
      return feed ? [feed] : []
    }
    const all = nestableChildFeeders(system690, equipment.id, {
      feedParentId: circuit.originId,
    })
    // SSB: INS→BUS no cuenta como salida del cuadro
    if (hasSsbBoardLayout(equipment)) {
      return feedScopedChildFeeders(
        all.filter(
          (x) =>
            !isSsbIncomingCircuit(x.circuit) &&
            !x.equipment.virtual &&
            !x.circuit.destinationId.startsWith('BUS-'),
        ),
        circuit,
      )
    }
    return feedScopedChildFeeders(all, circuit)
  }, [equipment, circuit])
  const feeds = useMemo(
    () => incomingFeeds(system690, equipment.id),
    [equipment.id],
  )
  const aux24Feeds = useMemo(
    () =>
      isAux24Feed(circuit)
        ? []
        : aux24FeedsForEquipment(system690, equipment.id),
    [circuit, equipment.id],
  )
  const canExpand =
    !isAux24Feed(circuit) &&
    (children.length > 0 ||
      isLcsEquipment(equipment.id) ||
      isTrfWithLoadCenter(system690, equipment.id) ||
      isMsb4Sfs(equipment.id) ||
      hasSsbBoardLayout(equipment))
  const trfBankNote = useMemo(
    () =>
      equipment.id.startsWith('TRF-')
        ? windingNotesForTrf(equipment.id)
        : undefined,
    [equipment.id],
  )
  /** Cadena ABT → TRF → LCS / SBT → SCV: enlace vertical directo (sin barra «salidas»). */
  const directChain =
    equipment.id.startsWith('ABT-') ||
    equipment.id.startsWith('TRF-') ||
    equipment.id.startsWith('SBT-') ||
    equipment.id.startsWith('SCV-') ||
    isLcsEquipment(equipment.id)

  const localFeed = feeds.find((c) => c.id === circuit.id) ?? circuit
  const localFlowing = energizedCircuitIds.has(localFeed.id)
  const eqEnergized = energizedEquipmentIds.has(equipment.id)
  const isAltLocal = localFeed.lineType === 'alternativa'
  const [eqHover, setEqHover] = useState(false)
  const [showEqBalloon, setShowEqBalloon] = useState(false)
  const eqWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!eqHover) {
      setShowEqBalloon(false)
      return
    }
    const t = window.setTimeout(() => setShowEqBalloon(true), 1800)
    return () => window.clearTimeout(t)
  }, [eqHover])

  const childItems = useMemo(() => {
    const all = children.map(({ circuit: c, equipment: eq }) => ({
      key: c.id,
      circuit: c,
      equipment: eq,
    }))
    if (!focusCircuitIds) return all
    return all.filter((it) => focusCircuitIds.has(it.circuit.id))
  }, [children, focusCircuitIds])

  const feedSummaries = useMemo(() => {
    const list = feeds
      .filter((f) => !isAux24Feed(f))
      .map((f) => ({
        name: f.protectionName,
        lineType: f.lineType,
        originId: f.originId,
      }))
    for (const aux of aux24Feeds) {
      list.push({
        name: `${aux.protectionName} (AUX 24 V)`,
        lineType: aux.lineType,
        originId: aux.originId,
      })
    }
    return list
  }, [feeds, aux24Feeds])

  const toggleExpand = (e: ReactMouseEvent) => {
    if (!canExpand) return
    e.preventDefault()
    e.stopPropagation()
    onToggleEquip(equipment.id)
  }

  const lcsOpen =
    !isAux24Feed(circuit) && isLcsEquipment(equipment.id) && expanded
  const msb4sfsOpen =
    !isAux24Feed(circuit) && isMsb4Sfs(equipment.id) && expanded
  const ssbOpen =
    !msb4sfsOpen &&
    Boolean(equipment.incomingSwitch || /^SSB-[12]SFS/i.test(equipment.id)) &&
    hasSsbBoardLayout(equipment) &&
    expanded
  const ssb2209 = isSsb2Pws2209(equipment.id)
  const equipFam = equipFamOf(equipment, isLcsEquipment(equipment.id))
  const expandLabel = isTrfWithLoadCenter(system690, equipment.id)
    ? expanded
      ? '▴ LCS'
      : '▾ LCS'
    : isLcsEquipment(equipment.id)
      ? expanded
        ? '▴ 440/230'
        : '▾ 440/230'
      : isMsb4Sfs(equipment.id)
        ? expanded
          ? '▴ 400 Hz'
          : '▾ 400 Hz'
        : hasSsbBoardLayout(equipment)
          ? expanded
            ? `▴ ${children.length}`
            : `▾ ${children.length}`
          : `${children.length} ${expanded ? '▴' : '▾'}`

  if (lcsOpen) {
    const located = locateEquipmentId === equipment.id
    return (
      <div
        className={`hbus-drop hbus-drop--fam-${equipFam}${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}${canExpand ? ' hbus-drop--expandable' : ''} hbus-drop--lcs-open${located ? ' hbus-drop--locate' : ''}`}
        data-equip={equipment.id}
        data-locate={located ? '1' : undefined}
        data-circuit-id={localFeed.id}
        aria-label={`${equipment.id} · doble clic para plegar`}
        onDoubleClick={toggleExpand}
      >
        {aux24Feeds.length > 0 && (
          <div className="hbus-drop__tops hbus-drop__tops--aux">
            {aux24Feeds.map((aux) => (
              <Aux24Incoming
                key={aux.id}
                circuit={aux}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
            ))}
          </div>
        )}
        <div
          className={`equip-chassis equip-chassis--lcs${eqEnergized ? ' equip-chassis--live' : ''}${localFlowing ? ' equip-chassis--feed-flow' : ''}${isAltLocal ? ' equip-chassis--feed-alt' : ''}${located ? ' equip-chassis--locate' : ''}`}
          onDoubleClick={toggleExpand}
          aria-label={`${equipment.id} · doble clic para plegar`}
        >
            <div
              ref={eqWrapRef}
              className="equip-chassis__label"
              onMouseEnter={() => setEqHover(true)}
              onMouseLeave={() => setEqHover(false)}
            >
              <span className="equip-chassis__id">{equipment.id}</span>
              <span className="equip-chassis__hint">doble clic · plegar</span>
              {showEqBalloon && (
                <EquipmentBalloon
                  equipment={equipment}
                  feeds={feedSummaries}
                  circuits={feeds}
                  anchorRef={eqWrapRef}
                />
              )}
            </div>
            <div className="equip-chassis__body">
              <LcsDualView
                lcsId={equipment.id}
                inline
                incoming={localFeed}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                energizedEquipmentIds={energizedEquipmentIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
                locateEquipmentId={locateEquipmentId}
                expandedEquip={expandedEquip}
                onToggleEquip={onToggleEquip}
              />
            </div>
        </div>
      </div>
    )
  }

  if (msb4sfsOpen) {
    const located = locateEquipmentId === equipment.id
    const linkOnly = isUnifilarLinkOnlyFeed(localFeed)
    return (
      <div
        className={`hbus-drop hbus-drop--fam-${equipFam}${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}${canExpand ? ' hbus-drop--expandable' : ''} hbus-drop--msb4sfs-open${linkOnly ? ' hbus-drop--link-only' : ''}${located ? ' hbus-drop--locate' : ''}`}
        data-equip={equipment.id}
        data-locate={located ? '1' : undefined}
        data-circuit-id={localFeed.id}
        aria-label={`${equipment.id} · doble clic para plegar`}
        onDoubleClick={toggleExpand}
      >
        <div
          className={`hbus-drop__tops${linkOnly && aux24Feeds.length > 0 ? ' hbus-drop__tops--link-aux' : ''}`}
        >
          {aux24Feeds.length > 0 &&
            !isAux24Feed(localFeed) &&
            aux24Feeds.map((aux) => (
              <Aux24Incoming
                key={aux.id}
                circuit={aux}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
            ))}
          {linkOnly ? (
            <div
              className={`hbus-drop__leg hbus-drop__leg--thru${isAltLocal ? ' hbus-drop__leg--alt' : ' hbus-drop__leg--norm'}${localFlowing ? ' hbus-drop__leg--flow' : ''}`}
              data-circuit-id={localFeed.id}
              aria-hidden
            >
              <span
                className={`hbus-drop__wire hbus-drop__wire--thru${localFlowing ? ' hbus-drop__wire--flow' : ''}`}
              />
            </div>
          ) : (
            <div
              className={`hbus-drop__leg hbus-drop__leg--local${isAltLocal ? ' hbus-drop__leg--alt' : ' hbus-drop__leg--norm'}${localFlowing ? ' hbus-drop__leg--flow' : ''}`}
              data-circuit-id={localFeed.id}
            >
              <span
                className="hbus-drop__wire hbus-drop__wire--from-bus"
                aria-hidden
              />
              <BreakerChip
                name={localFeed.protectionName}
                state={protectionStatus[localFeed.id]}
                compact
                circuitId={localFeed.id}
                circuit={localFeed}
                flowing={localFlowing}
                locked={lockedCircuits.has(localFeed.id)}
                onClick={(e) => onLocalBreaker(localFeed, e)}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
              <span className="hbus-drop__wire hbus-drop__wire--mid" aria-hidden />
              <span
                className={`hbus-drop__wire hbus-drop__wire--to-eq${localFlowing ? ' hbus-drop__wire--flow' : ''}`}
                aria-hidden
              />
            </div>
          )}
        </div>
        <div className="hbus-drop__eq-row">
          <div
            className={`equip-chassis equip-chassis--msb4sfs${eqEnergized ? ' equip-chassis--live' : ''}${localFlowing ? ' equip-chassis--feed-flow' : ''}${isAltLocal ? ' equip-chassis--feed-alt' : ''}${located ? ' equip-chassis--locate' : ''}`}
            onDoubleClick={toggleExpand}
            aria-label={`${equipment.id} · doble clic para plegar`}
          >
            <div
              ref={eqWrapRef}
              className="equip-chassis__label"
              onMouseEnter={() => setEqHover(true)}
              onMouseLeave={() => setEqHover(false)}
            >
              <span className="equip-chassis__id">{equipment.id}</span>
              <span className="equip-chassis__hint">doble clic · plegar</span>
              {showEqBalloon && (
                <EquipmentBalloon
                  equipment={equipment}
                  feeds={feedSummaries}
                  circuits={feeds}
                  anchorRef={eqWrapRef}
                />
              )}
            </div>
            <div className="equip-chassis__body">
              <Msb4SfsBoardView
                msb={equipment}
                feed={localFeed}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                energizedEquipmentIds={energizedEquipmentIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
                expandedEquip={expandedEquip}
                onToggleEquip={onToggleEquip}
                locateEquipmentId={locateEquipmentId}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (ssbOpen) {
    const located = locateEquipmentId === equipment.id
    const linkOnly = isUnifilarLinkOnlyFeed(localFeed)
    return (
      <div
        className={`hbus-drop hbus-drop--fam-${equipFam}${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}${canExpand ? ' hbus-drop--expandable' : ''} hbus-drop--ssb-open${ssb2209 ? ' hbus-drop--ssb2209' : ''}${linkOnly ? ' hbus-drop--link-only' : ''}${located ? ' hbus-drop--locate' : ''}`}
        data-equip={equipment.id}
        data-locate={located ? '1' : undefined}
        data-circuit-id={localFeed.id}
        aria-label={`${equipment.id} · doble clic para plegar`}
        onDoubleClick={toggleExpand}
      >
        {!linkOnly && (
          <div className="hbus-drop__tops">
            {aux24Feeds.length > 0 &&
              !isAux24Feed(localFeed) &&
              aux24Feeds.map((aux) => (
                <Aux24Incoming
                  key={aux.id}
                  circuit={aux}
                  protectionStatus={protectionStatus}
                  energizedCircuitIds={energizedCircuitIds}
                  lockedCircuits={lockedCircuits}
                  onLocalBreaker={onLocalBreaker}
                  onJumpToCircuit={onJumpToCircuit}
                  onHoverInfo={onHoverInfo}
                  onHoverInfoEnd={onHoverInfoEnd}
                />
              ))}
            <div
              className={`hbus-drop__leg hbus-drop__leg--local${isAltLocal ? ' hbus-drop__leg--alt' : ' hbus-drop__leg--norm'}${localFlowing ? ' hbus-drop__leg--flow' : ''}`}
              data-circuit-id={localFeed.id}
            >
              <span
                className="hbus-drop__wire hbus-drop__wire--from-bus"
                aria-hidden
              />
              <BreakerChip
                name={localFeed.protectionName}
                state={protectionStatus[localFeed.id]}
                compact
                circuitId={localFeed.id}
                circuit={localFeed}
                flowing={localFlowing}
                locked={lockedCircuits.has(localFeed.id)}
                onClick={(e) => onLocalBreaker(localFeed, e)}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
              <span className="hbus-drop__wire hbus-drop__wire--mid" aria-hidden />
              <span
                className={`hbus-drop__wire hbus-drop__wire--to-eq${localFlowing ? ' hbus-drop__wire--flow' : ''}`}
                aria-hidden
              />
            </div>
          </div>
        )}
        {linkOnly && aux24Feeds.length > 0 && !isAux24Feed(localFeed) && (
          <div className="hbus-drop__tops hbus-drop__tops--link-aux">
            {aux24Feeds.map((aux) => (
              <Aux24Incoming
                key={aux.id}
                circuit={aux}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
            ))}
            <div
              className={`hbus-drop__leg hbus-drop__leg--thru${isAltLocal ? ' hbus-drop__leg--alt' : ' hbus-drop__leg--norm'}${localFlowing ? ' hbus-drop__leg--flow' : ''}`}
              data-circuit-id={localFeed.id}
              aria-hidden
            >
              <span
                className={`hbus-drop__wire hbus-drop__wire--thru${localFlowing ? ' hbus-drop__wire--flow' : ''}`}
              />
            </div>
          </div>
        )}
        <div className="hbus-drop__eq-row">
          <div
            className={`equip-chassis equip-chassis--ssb${eqEnergized ? ' equip-chassis--live' : ''}${localFlowing ? ' equip-chassis--feed-flow' : ''}${isAltLocal ? ' equip-chassis--feed-alt' : ''}${located ? ' equip-chassis--locate' : ''}`}
            onDoubleClick={toggleExpand}
            aria-label={`${equipment.id} · doble clic para plegar`}
          >
            {ssb2209 && (
              <span className="ssb2209-chassis-alt-riser" aria-hidden />
            )}
            <div
              ref={eqWrapRef}
              className="equip-chassis__label"
              onMouseEnter={() => setEqHover(true)}
              onMouseLeave={() => setEqHover(false)}
            >
              <span className="equip-chassis__id">{equipment.id}</span>
              <span className="equip-chassis__name">{equipment.name}</span>
              <span className="equip-chassis__hint">doble clic · plegar</span>
              {showEqBalloon && (
                <EquipmentBalloon
                  equipment={equipment}
                  feeds={feedSummaries}
                  circuits={feeds}
                  anchorRef={eqWrapRef}
                />
              )}
            </div>
            <div className="equip-chassis__body">
              <SsbBoardView
                ssb={equipment}
                feed={localFeed}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                energizedEquipmentIds={energizedEquipmentIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
                expandedEquip={expandedEquip}
                onToggleEquip={onToggleEquip}
                focusCircuitIds={focusCircuitIds}
                locateEquipmentId={locateEquipmentId}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const feedsOpenLcs =
    isTrfWithLoadCenter(system690, equipment.id) &&
    expanded &&
    childItems.some(
      (it) =>
        isLcsEquipment(it.equipment.id) && expandedEquip.has(it.equipment.id),
    )

  return (
    <EquipmentBusDrop
      circuit={circuit}
      equipment={equipment}
      protectionStatus={protectionStatus}
      energizedCircuitIds={energizedCircuitIds}
      energizedEquipmentIds={energizedEquipmentIds}
      lockedCircuits={lockedCircuits}
      onLocalBreaker={onLocalBreaker}
      onJumpToCircuit={onJumpToCircuit}
      onHoverInfo={onHoverInfo}
      onHoverInfoEnd={onHoverInfoEnd}
      canExpand={canExpand}
      expanded={expanded}
      expandLabel={expandLabel}
      onToggleExpand={() => onToggleEquip(equipment.id)}
      equipFam={equipFam}
      bankNote={trfBankNote}
      located={locateEquipmentId === equipment.id}
      linkOnlyFromParent={isUnifilarLinkOnlyFeed(localFeed)}
      rootClassName={[
        expanded && isMsb4Sfs(equipment.id)
          ? 'hbus-drop--msb4sfs-open'
          : expanded &&
              (childItems.length > 0 || hasSsbBoardLayout(equipment))
            ? hasSsbBoardLayout(equipment)
              ? 'hbus-drop--ssb-open'
              : 'hbus-drop--chain-open'
            : '',
        feedsOpenLcs ? 'hbus-drop--feeds-lcs-open' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined}
    >
      {expanded && isMsb4Sfs(equipment.id) && (
        <Msb4SfsBoardView
          msb={equipment}
          feed={localFeed}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          expandedEquip={expandedEquip}
          onToggleEquip={onToggleEquip}
          locateEquipmentId={locateEquipmentId}
        />
      )}
      {expanded &&
        !isMsb4Sfs(equipment.id) &&
        hasSsbBoardLayout(equipment) && (
        <SsbBoardView
          ssb={equipment}
          feed={localFeed}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          expandedEquip={expandedEquip}
          onToggleEquip={onToggleEquip}
          focusCircuitIds={focusCircuitIds}
          locateEquipmentId={locateEquipmentId}
        />
      )}
      {expanded &&
        !isMsb4Sfs(equipment.id) &&
        !hasSsbBoardLayout(equipment) &&
        childItems.length > 0 && (
        <HorizontalBus
          nested
          direct={directChain}
          label={equipment.id}
          items={childItems}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          expandedEquip={expandedEquip}
          onToggleEquip={onToggleEquip}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          focusCircuitIds={focusCircuitIds}
          locateEquipmentId={locateEquipmentId}
        />
      )}
    </EquipmentBusDrop>
  )
}

function genShortLabel(half: BusHalf, boardId: string): string {
  const n = boardId.endsWith('1') ? '1' : '2'
  return `G${n}${half === 'SA' ? 'A' : 'B'}`
}

/** U invertida QT2A (2SA) ↔ QT1B (1SB) anclada a la geometría real de los interruptores */
function BusTieInterconnect({
  leftId,
  rightId,
  flowing,
  zoom,
  plantRef,
  layoutKey,
}: {
  leftId: string
  rightId: string
  flowing: boolean
  zoom: number
  plantRef: RefObject<HTMLDivElement | null>
  layoutKey: string
}) {
  const [geom, setGeom] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
    yTop: number
    w: number
    h: number
  } | null>(null)

  const measure = useCallback(() => {
    const plant = plantRef.current
    if (!plant) return
    const left = plant.querySelector(
      `.plant-msb__bustie [data-circuit-id="${leftId}"]`,
    ) as HTMLElement | null
    const right = plant.querySelector(
      `.plant-msb__bustie [data-circuit-id="${rightId}"]`,
    ) as HTMLElement | null
    if (!left || !right) {
      setGeom(null)
      return
    }
    const pr = plant.getBoundingClientRect()
    const lr = left.getBoundingClientRect()
    const rr = right.getBoundingClientRect()
    const z = zoom > 0 ? zoom : 1
    const x1 = (lr.left + lr.width / 2 - pr.left) / z
    const y1 = (lr.top - pr.top) / z
    const x2 = (rr.left + rr.width / 2 - pr.left) / z
    const y2 = (rr.top - pr.top) / z
    const rise = 30
    setGeom({
      x1,
      y1,
      x2,
      y2,
      yTop: Math.min(y1, y2) - rise,
      w: Math.max(plant.offsetWidth, plant.scrollWidth),
      h: Math.max(plant.offsetHeight, plant.scrollHeight),
    })
  }, [leftId, rightId, zoom, plantRef])

  useLayoutEffect(() => {
    measure()
    const plant = plantRef.current
    if (!plant) return
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null
    ro?.observe(plant)
    const left = plant.querySelector(
      `.plant-msb__bustie [data-circuit-id="${leftId}"]`,
    )
    const right = plant.querySelector(
      `.plant-msb__bustie [data-circuit-id="${rightId}"]`,
    )
    if (left) ro?.observe(left)
    if (right) ro?.observe(right)
    window.addEventListener('resize', measure)
    const t = window.setTimeout(measure, 50)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
      window.clearTimeout(t)
    }
  }, [measure, leftId, rightId, layoutKey])

  if (!geom) return null

  const d = `M ${geom.x1} ${geom.y1} V ${geom.yTop} H ${geom.x2} V ${geom.y2}`
  const midX = (geom.x1 + geom.x2) / 2

  return (
    <svg
      className={`plant__tie-svg${flowing ? ' plant__tie-svg--flow' : ''}`}
      width={geom.w}
      height={geom.h}
      viewBox={`0 0 ${geom.w} ${geom.h}`}
      aria-hidden
    >
      <path d={d} className="plant__tie-path" fill="none" />
      {flowing ? (
        <path d={d} className="plant__tie-halo" fill="none" aria-hidden />
      ) : null}
      <text
        x={midX}
        y={geom.yTop - 6}
        textAnchor="middle"
        className="plant__tie-label"
      >
        INTERCONEXIÓN CUADROS
      </text>
    </svg>
  )
}

export const CascadeView = forwardRef<CascadeViewHandle, CascadeViewProps>(
  function CascadeView(
    {
      protectionStatus,
      energizedCircuitIds,
      energizedEquipmentIds,
      energizedBusHalves,
      runningGenerators,
      lockedCircuits,
      lockTool,
      zoom,
      onZoomChange,
      focus,
      locateEquipmentId,
      onToggleProtection,
      onLockCircuit,
      onUnlockCircuit,
      onToggleGenerator,
      onClearFocus,
      onClearLocate,
    },
    ref,
  ) {
  const boards = useMemo(() => buildBoardModels(system690), [])
  const ties = useMemo(() => busTieCircuits(system690), [])
  const stageRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<HTMLDivElement>(null)
  const plantRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const focusRef = useRef(focus)
  focusRef.current = focus
  const locateRef = useRef(locateEquipmentId)
  locateRef.current = locateEquipmentId
  /** Tras zoom con rueda: reposicionar scroll (+ padding) para fijar el punto bajo el puntero */
  const pendingZoomScroll = useRef<{
    left: number
    top: number
    padX?: number
    padY?: number
  } | null>(null)
  /** Solo montaje / resize de ventana: encajar planta en viewport */
  const fitZoomPending = useRef(true)
  /**
   * Tras Desplegar/Plegar todo: 'fit' = zoom mínimo que cabe;
   * 'zoom100' = 100 % centrado; null = no forzar (usa fitZoomPending).
   */
  const pendingViewFit = useRef<'fit' | 'zoom100' | null>(null)
  const centerPending = useRef(false)
  const lastCenteredZoom = useRef<number | null>(null)
  /** Tras plegar/desplegar: centrar scroll en esa sección (sin cambiar zoom) */
  const pendingFocusTarget = useRef<{
    kind: 'board' | 'equip'
    id: string
  } | null>(null)
  /** Tras localizar: centrar en el equipo (reintentos tras expandir). */
  const pendingLocateScroll = useRef<string | null>(null)
  /** Tras saltar a acometida remota/AUX: centrar y resaltar el alimentador local. */
  const pendingJumpScroll = useRef<string | null>(null)
  const [jumpNonce, setJumpNonce] = useState(0)
  const jumpHighlightTimer = useRef<number | null>(null)
  /** Encaje del árbol de alimentaciones ya estabilizado (evita bucles/parpadeo). */
  const focusFitDone = useRef(false)
  const [plantSize, setPlantSize] = useState({ w: 0, h: 0 })
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(
    () => new Set(MSB_BOARD_IDS),
  )
  const [expandedEquip, setExpandedEquip] = useState<Set<string>>(new Set())
  const expandedBoardsRef = useRef(expandedBoards)
  expandedBoardsRef.current = expandedBoards
  const expandedEquipRef = useRef(expandedEquip)
  expandedEquipRef.current = expandedEquip
  /** Vista previa a localizar / saltar a acometida remota (una sola captura). */
  const viewOriginRef = useRef<PlantViewSnapshot | null>(null)
  const [hasViewBack, setHasViewBack] = useState(false)
  const [backKind, setBackKind] = useState<'locate' | 'jump' | null>(null)
  const pendingRestoreScroll = useRef<{ left: number; top: number } | null>(
    null,
  )
  const [restoreNonce, setRestoreNonce] = useState(0)
  const [balloon, setBalloon] = useState<{
    circuit: Circuit
    x: number
    y: number
  } | null>(null)

  const focusCircuitIds = useMemo(() => {
    if (!focus) return null
    return new Set(focus.trace.circuitIds)
  }, [focus])

  const focusEquipmentIds = useMemo(() => {
    if (!focus) return null
    return new Set(focus.trace.equipmentIds)
  }, [focus])

  useEffect(() => {
    if (!focus) {
      lastCenteredZoom.current = null
      focusFitDone.current = false
      return
    }
    fitZoomPending.current = false
    lastCenteredZoom.current = null
    focusFitDone.current = false
    // Evitar que el tamaño de la planta completa deje el árbol minúsculo un frame.
    setPlantSize({ w: 0, h: 0 })
    const boardsToOpen = new Set<string>()
    for (const c of focus.trace.circuits) {
      const b = boardFromOrigin(c.originId)
      if (b) boardsToOpen.add(b)
      const bd = boardFromOrigin(c.destinationId)
      if (bd) boardsToOpen.add(bd)
    }
    for (const id of focus.trace.equipmentIds) {
      if (id.startsWith('MSB-6PWS')) boardsToOpen.add(id)
    }
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      for (const b of boardsToOpen) next.add(b)
      return next
    })
  }, [focus])

  /** Localizar en planta: desplegar cadena (el scroll se hace tras layout). */
  useEffect(() => {
    if (!locateEquipmentId) {
      pendingLocateScroll.current = null
      return
    }
    if (!viewOriginRef.current) {
      const stage = panRef.current
      viewOriginRef.current = {
        boards: [...expandedBoardsRef.current],
        equip: [...expandedEquipRef.current],
        zoom: zoomRef.current,
        scrollLeft: stage?.scrollLeft ?? 0,
        scrollTop: stage?.scrollTop ?? 0,
      }
      setHasViewBack(true)
      setBackKind('locate')
    }
    const path = getPlantRevealPath(locateEquipmentId, system690)
    pendingLocateScroll.current = locateEquipmentId
    fitZoomPending.current = false
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      for (const b of path.boardIds) next.add(b)
      return next
    })
    setExpandedEquip((prev) => {
      const next = new Set(prev)
      for (const id of path.expandEquipIds) next.add(id)
      return next
    })
    if (zoomRef.current < 0.9) {
      onZoomChange(1)
    }
  }, [locateEquipmentId, onZoomChange])

  /** Desplazamiento arrastrando con el ratón (en vez de barra de scroll) */
  useEffect(() => {
    const el = panRef.current
    if (!el) return

    let dragging = false
    let moved = false
    let startX = 0
    let startY = 0
    let originLeft = 0
    let originTop = 0

    const isInteractive = (t: EventTarget | null) =>
      t instanceof Element &&
      !!t.closest(
        'button, a, input, select, textarea, label, .casc-brk, .casc-gen, .circuit-balloon, .equip-balloon, .hbus-drop__eq',
      )

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractive(e.target)) return
      // Armar pan sin capturar aún: si no, el 2º clic del doble-clic no llega al MSB
      dragging = true
      moved = false
      startX = e.clientX
      startY = e.clientY
      originLeft = el.scrollLeft
      originTop = el.scrollTop
    }

    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) <= 3) return
        moved = true
        el.classList.add('is-panning')
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      el.scrollLeft = originLeft - dx
      el.scrollTop = originTop - dy
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      el.classList.remove('is-panning')
      if (moved) {
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        e.preventDefault()
        e.stopPropagation()
      }
      moved = false
    }

    const onWheel = (e: WheelEvent) => {
      // Zoom con la rueda hacia el puntero (planta y árbol de alimentaciones)
      e.preventDefault()
      fitZoomPending.current = false
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const current = zoomRef.current
      const next = Math.min(
        2.5,
        Math.max(0.25, Math.round(current * factor * 100) / 100),
      )
      if (next === current) return

      const rect = el.getBoundingClientRect()
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top

      const plant = plantRef.current
      const space = plant?.parentElement
      const oldPadX = space
        ? Number.parseFloat(getComputedStyle(space).paddingLeft) || 0
        : 0
      const oldPadY = space
        ? Number.parseFloat(getComputedStyle(space).paddingTop) || 0
        : 0
      // Coordenadas en el unifilar sin scale (antes del padding del zoom-space)
      const plantX = (el.scrollLeft + offsetX - oldPadX) / current
      const plantY = (el.scrollTop + offsetY - oldPadY) / current

      const cw = (plant?.offsetWidth ?? 0) * next
      const ch = (plant?.offsetHeight ?? 0) * next
      const padX = Math.max(24, (el.clientWidth - cw) / 2)
      const padY = Math.max(24, (el.clientHeight - ch) / 2)

      pendingZoomScroll.current = {
        left: padX + plantX * next - offsetX,
        top: padY + plantY * next - offsetY,
        padX,
        padY,
      }
      centerPending.current = false
      onZoomChange(next)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [onZoomChange])

  useEffect(() => {
    const el = plantRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // En vista árbol el tamaño lo fija fitFocusTreeView; no reinyectar plantSize
    // (provoca parpadeo al cambiar zoom/padding).
    if (focusRef.current) return
    const ro = new ResizeObserver(() => {
      if (focusRef.current || locateRef.current) return
      const w = el.offsetWidth
      const h = el.offsetHeight
      setPlantSize((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h },
      )
    })
    ro.observe(el)
    setPlantSize({ w: el.offsetWidth, h: el.offsetHeight })
    return () => ro.disconnect()
  }, [expandedBoards, focus, expandedEquip])

  /** Encaja el árbol de alimentaciones a pantalla completa y lo centra. */
  const fitFocusTreeView = useCallback(() => {
    const stage = panRef.current
    const plant = plantRef.current
    if (!stage || !plant || !focusRef.current) return false
    const space = plant.parentElement as HTMLElement | null
    if (!space?.classList.contains('plant-zoom-space--focus')) return false

    // Medir sin scale (transform no altera offsetWidth/Height)
    space.style.padding = '24px'
    const w = plant.offsetWidth
    const h = plant.offsetHeight
    if (w < 8 || h < 8) return false

    const pad = 56
    const availW = Math.max(stage.clientWidth - pad, 80)
    const availH = Math.max(stage.clientHeight - pad, 80)
    const fit = Math.min(availW / w, availH / h)
    const next = Math.min(2.5, Math.max(0.4, Math.round(fit * 100) / 100))

    setPlantSize({ w, h })
    focusFitDone.current = true
    lastCenteredZoom.current = next
    centerPending.current = true
    pendingZoomScroll.current = null

    if (Math.abs(next - zoomRef.current) >= 0.01) {
      onZoomChange(next)
    } else {
      // Forzar centrado en el layout effect / rAF
      requestAnimationFrame(() => {
        const s = panRef.current
        const p = plantRef.current
        const sp = p?.parentElement
        if (!s || !p || !sp || !focusRef.current) {
          centerPending.current = false
          return
        }
        const z = zoomRef.current
        const cw = w * z
        const ch = h * z
        const padX = Math.max(24, (s.clientWidth - cw) / 2)
        const padY = Math.max(24, (s.clientHeight - ch) / 2)
        sp.style.paddingLeft = `${padX}px`
        sp.style.paddingRight = `${padX}px`
        sp.style.paddingTop = `${padY}px`
        sp.style.paddingBottom = `${padY}px`
        s.scrollLeft = Math.max(0, padX + cw / 2 - s.clientWidth / 2)
        s.scrollTop = Math.max(0, padY + ch / 2 - s.clientHeight / 2)
        centerPending.current = false
      })
    }
    return true
  }, [onZoomChange])

  /** Mide la planta y aplica zoom (fit o fijo) + centrado. */
  const applyPlantViewFit = useCallback(
    (
      mode: 'fit' | 'zoom100',
      opts?: { clearPending?: boolean },
    ): boolean => {
      if (focusRef.current) return false
      const stage = panRef.current
      const plant = plantRef.current
      if (!stage || !plant) return false
      const space = plant.parentElement as HTMLElement | null
      if (!space || !space.classList.contains('plant-zoom-space')) return false

      space.style.padding = '24px'

      const w = plant.offsetWidth
      const h = plant.offsetHeight
      if (w < 8 || h < 8) return false

      let next: number
      if (mode === 'zoom100') {
        next = 1
      } else {
        const pad = 48
        const availW = Math.max(stage.clientWidth - pad, 80)
        const availH = Math.max(stage.clientHeight - pad, 80)
        const fit = Math.min(availW / w, availH / h)
        next = Math.min(2.5, Math.max(0.25, Math.round(fit * 100) / 100))
      }

      setPlantSize({ w, h })
      if (opts?.clearPending !== false) {
        fitZoomPending.current = false
        pendingViewFit.current = null
      }
      centerPending.current = true
      pendingZoomScroll.current = null

      const applyCenterNow = () => {
        const s = panRef.current
        const p = plantRef.current
        const sp = p?.parentElement
        if (!s || !p || !sp) {
          centerPending.current = false
          return
        }
        const z = mode === 'zoom100' ? 1 : zoomRef.current
        const cw = p.offsetWidth * z
        const ch = p.offsetHeight * z
        if (cw < 8 || ch < 8) return
        const padX = Math.max(24, (s.clientWidth - cw) / 2)
        const padY = Math.max(24, (s.clientHeight - ch) / 2)
        sp.style.paddingLeft = `${padX}px`
        sp.style.paddingRight = `${padX}px`
        sp.style.paddingTop = `${padY}px`
        sp.style.paddingBottom = `${padY}px`
        s.scrollLeft = Math.max(0, padX + cw / 2 - s.clientWidth / 2)
        s.scrollTop = Math.max(0, padY + ch / 2 - s.clientHeight / 2)
        centerPending.current = false
        lastCenteredZoom.current = z
      }

      if (Math.abs(next - zoomRef.current) >= 0.01) {
        onZoomChange(next)
        // Centrar tras aplicar el zoom (layout effect también; este refuerza)
        requestAnimationFrame(() => {
          requestAnimationFrame(applyCenterNow)
        })
      } else {
        requestAnimationFrame(applyCenterNow)
      }
      return true
    },
    [onZoomChange],
  )

  /** Mide la planta real (no el plantSize en estado, que puede ir retrasado) */
  const fitAndCenterView = useCallback(() => {
    if (focusRef.current) {
      fitFocusTreeView()
      return
    }
    if (!applyPlantViewFit('fit')) {
      window.setTimeout(() => {
        if (fitZoomPending.current || pendingViewFit.current === 'fit') {
          applyPlantViewFit('fit')
        }
      }, 120)
    }
  }, [applyPlantViewFit, fitFocusTreeView])

  /** Al abrir el árbol: esperar layout y encajar a pantalla una sola vez. */
  useLayoutEffect(() => {
    if (!focus || focusFitDone.current) return
    let cancelled = false
    const delays = [0, 50, 120, 250, 450]
    const tryFit = (i: number) => {
      if (cancelled || focusFitDone.current) return
      if (fitFocusTreeView()) return
      if (i + 1 < delays.length) {
        window.setTimeout(() => tryFit(i + 1), delays[i + 1]! - delays[i]!)
      }
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => tryFit(0))
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
    }
  }, [focus, fitFocusTreeView])

  useLayoutEffect(() => {
    const stage = panRef.current
    const plant = plantRef.current
    const space = plant?.parentElement
    if (!stage || !plant || !space?.classList.contains('plant-zoom-space')) {
      centerPending.current = false
      return
    }

    const applyCenter = () => {
      const z = zoom
      // Medida en vivo: plantSize puede quedar del despliegue anterior
      const cw = plant.offsetWidth * z
      const ch = plant.offsetHeight * z
      if (cw < 8 || ch < 8) return
      const padX = Math.max(24, (stage.clientWidth - cw) / 2)
      const padY = Math.max(24, (stage.clientHeight - ch) / 2)
      space.style.paddingLeft = `${padX}px`
      space.style.paddingRight = `${padX}px`
      space.style.paddingTop = `${padY}px`
      space.style.paddingBottom = `${padY}px`
      stage.scrollLeft = Math.max(0, padX + cw / 2 - stage.clientWidth / 2)
      stage.scrollTop = Math.max(0, padY + ch / 2 - stage.clientHeight / 2)
      lastCenteredZoom.current = zoom
    }

    // Zoom a puntero (planta y árbol): aplicar scroll/padding pendientes
    const pending = pendingZoomScroll.current
    if (pending) {
      pendingZoomScroll.current = null
      if (pending.padX != null && pending.padY != null) {
        space.style.paddingLeft = `${pending.padX}px`
        space.style.paddingRight = `${pending.padX}px`
        space.style.paddingTop = `${pending.padY}px`
        space.style.paddingBottom = `${pending.padY}px`
      }
      stage.scrollLeft = pending.left
      stage.scrollTop = pending.top
      centerPending.current = false
      lastCenteredZoom.current = zoom
      return
    }
    pendingZoomScroll.current = null

    // Vista árbol: centrar al abrir / botones +/- (no tras rueda → puntero)
    if (focusRef.current) {
      if (centerPending.current || lastCenteredZoom.current !== zoom) {
        centerPending.current = false
        applyCenter()
      }
      return
    }

    // Solo cuando se pidió explícitamente (evita el parpadeo continuo)
    if (!centerPending.current) return
    centerPending.current = false
    applyCenter()
  }, [zoom, plantSize.w, plantSize.h, focus])

  /** Tras plegar/desplegar o montaje: encajar / centrar en viewport */
  useEffect(() => {
    const mode = pendingViewFit.current
    if (!fitZoomPending.current && mode == null) return
    if (locateRef.current || focusRef.current) return

    let cancelled = false
    const fitMode: 'fit' | 'zoom100' = mode === 'zoom100' ? 'zoom100' : 'fit'
    // Desplegar: varios pases (DOM crece). Plegar: varios pases (DOM encoge + zoom 100%).
    const delays =
      fitMode === 'fit' ? [120, 320, 650, 1100, 1700] : [50, 120, 250, 450]

    const tryFit = (i: number) => {
      if (cancelled || locateRef.current || focusRef.current) return
      const isLast = i + 1 >= delays.length
      applyPlantViewFit(fitMode, { clearPending: isLast })
      if (!isLast) {
        window.setTimeout(() => tryFit(i + 1), delays[i + 1]! - delays[i]!)
        return
      }
      fitZoomPending.current = false
      pendingViewFit.current = null
    }

    const t = window.setTimeout(() => tryFit(0), delays[0])
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [expandedBoards, expandedEquip, focus, applyPlantViewFit])

  // Viewport del stage: solo si el ancho cambia de verdad (redimensionar ventana)
  useEffect(() => {
    const stage = panRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    let lastW = stage.clientWidth
    let t: number | undefined
    const ro = new ResizeObserver(() => {
      const w = stage.clientWidth
      if (Math.abs(w - lastW) < 48) return
      lastW = w
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        fitZoomPending.current = true
        fitAndCenterView()
      }, 100)
    })
    ro.observe(stage)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [fitAndCenterView])

  /** Centra el scroll del stage en un elemento, sin cambiar el zoom */
  const scrollStageToElement = useCallback((el: HTMLElement) => {
    const stage = panRef.current
    if (!stage) return
    const stageRect = stage.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    const elCenterX = elRect.left + elRect.width / 2
    const stageCenterX = stageRect.left + stage.clientWidth / 2
    stage.scrollLeft += elCenterX - stageCenterX

    if (elRect.height > stage.clientHeight * 0.85) {
      // Sección muy alta: anclar el inicio cerca de la parte superior
      stage.scrollTop += elRect.top - stageRect.top - 28
    } else {
      const elCenterY = elRect.top + elRect.height / 2
      const stageCenterY = stageRect.top + stage.clientHeight / 2
      stage.scrollTop += elCenterY - stageCenterY
    }
  }, [])

  const scrollToLocatedEquipment = useCallback(() => {
    const id = pendingLocateScroll.current
    const plant = plantRef.current
    if (!id || !plant || focusRef.current) return false

    const el =
      (plant.querySelector(
        `[data-equip="${id}"][data-locate="1"]`,
      ) as HTMLElement | null) ??
      (plant.querySelector(`[data-equip="${id}"]`) as HTMLElement | null)
    if (!el) return false

    pendingLocateScroll.current = null
    scrollStageToElement(el)
    el.classList.add('locate-flash')
    window.setTimeout(() => el.classList.remove('locate-flash'), 1800)
    return true
  }, [scrollStageToElement])

  const scrollToJumpedCircuit = useCallback(() => {
    const id = pendingJumpScroll.current
    const plant = plantRef.current
    if (!id || !plant || focusRef.current) return false

    const drop = plant.querySelector(
      `.hbus-drop[data-circuit-id="${id}"]`,
    ) as HTMLElement | null
    const localBrk = (drop?.querySelector(
      `.hbus-drop__leg--local [data-circuit-id="${id}"]`,
    ) ??
      drop?.querySelector(
        `.hbus-drop__leg--local[data-circuit-id="${id}"]`,
      ) ??
      plant.querySelector(
        `.hbus-drop__leg--local [data-circuit-id="${id}"]`,
      )) as HTMLElement | null

    const target = localBrk ?? drop
    if (!target) return false

    pendingJumpScroll.current = null
    scrollStageToElement(target)

    // Quitar resaltados previos de otros saltos
    plant.querySelectorAll('.hbus-drop--jump-hl').forEach((el) => {
      el.classList.remove('hbus-drop--jump-hl')
    })

    if (drop) {
      drop.classList.add('hbus-drop--jump-hl', 'locate-flash')
      window.setTimeout(() => {
        drop.classList.remove('locate-flash')
      }, 1800)
    }
    const flashEl = localBrk ?? target
    flashEl.classList.add('casc-brk--flash')
    window.setTimeout(() => {
      flashEl.classList.remove('casc-brk--flash')
    }, 1800)

    if (jumpHighlightTimer.current != null) {
      window.clearTimeout(jumpHighlightTimer.current)
    }
    jumpHighlightTimer.current = window.setTimeout(() => {
      drop?.classList.remove('hbus-drop--jump-hl')
      jumpHighlightTimer.current = null
    }, 4500)

    return true
  }, [scrollStageToElement])

  useLayoutEffect(() => {
    if (!locateEquipmentId || !pendingLocateScroll.current) return
    let cancelled = false
    const delays = [0, 60, 160, 320, 560, 900]
    const tryScroll = (i: number) => {
      if (cancelled) return
      if (scrollToLocatedEquipment()) return
      if (i + 1 < delays.length) {
        window.setTimeout(
          () => tryScroll(i + 1),
          delays[i + 1]! - delays[i]!,
        )
      }
    }
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => tryScroll(0))
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [
    locateEquipmentId,
    expandedBoards,
    expandedEquip,
    scrollToLocatedEquipment,
  ])

  useLayoutEffect(() => {
    if (!pendingJumpScroll.current) return
    let cancelled = false
    const delays = [0, 60, 160, 320, 560, 900, 1300]
    const tryScroll = (i: number) => {
      if (cancelled) return
      if (scrollToJumpedCircuit()) return
      if (i + 1 < delays.length) {
        window.setTimeout(
          () => tryScroll(i + 1),
          delays[i + 1]! - delays[i]!,
        )
      }
    }
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => tryScroll(0))
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [expandedBoards, expandedEquip, jumpNonce, scrollToJumpedCircuit])

  useEffect(() => {
    return () => {
      if (jumpHighlightTimer.current != null) {
        window.clearTimeout(jumpHighlightTimer.current)
      }
    }
  }, [])

  const focusPendingTarget = useCallback(() => {
    const pending = pendingFocusTarget.current
    const plant = plantRef.current
    const stage = panRef.current
    if (!pending || !plant || !stage) return false

    // Quitar el padding de "fit a pantalla completa" para no perder la vista
    // cuando la planta crece al desplegar.
    const space = plant.parentElement
    if (space?.classList.contains('plant-zoom-space')) {
      const pad = '48px'
      if (space.style.paddingTop !== pad) {
        space.style.padding = pad
        return false // reintentar tras reflow
      }
    }

    let el: HTMLElement | null = null
    if (pending.kind === 'board') {
      const col = plant.querySelector(
        `[data-board="${pending.id}"]`,
      ) as HTMLElement | null
      el =
        (col?.querySelector('.plant-rack__drops') as HTMLElement | null) ??
        (col?.querySelector('.plant-msb') as HTMLElement | null) ??
        col
    } else {
      const drop = plant.querySelector(
        `.hbus-drop[data-equip="${pending.id}"]`,
      ) as HTMLElement | null
      el =
        (drop?.querySelector('.hbus--nested') as HTMLElement | null) ?? drop
    }

    if (!el) return false
    pendingFocusTarget.current = null
    scrollStageToElement(el)
    return true
  }, [scrollStageToElement])

  /** Tras plegar/desplegar: esperar layout y centrar en la sección tocada */
  useLayoutEffect(() => {
    if (!pendingFocusTarget.current) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      if (!focusPendingTarget()) {
        window.setTimeout(() => {
          if (!cancelled) focusPendingTarget()
        }, 80)
      }
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
    }
  }, [expandedBoards, expandedEquip, focusPendingTarget])

  const toggleBoard = (id: string) => {
    // No recalcular zoom ni recentrar toda la planta: solo enfocar esta columna
    pendingFocusTarget.current = { kind: 'board', id }
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleEquip = (id: string) => {
    pendingFocusTarget.current = { kind: 'equip', id }
    setExpandedEquip((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearJumpHighlights = useCallback(() => {
    const plant = plantRef.current
    if (!plant) return
    plant.querySelectorAll('.hbus-drop--jump-hl').forEach((el) => {
      el.classList.remove('hbus-drop--jump-hl')
    })
    if (jumpHighlightTimer.current != null) {
      window.clearTimeout(jumpHighlightTimer.current)
      jumpHighlightTimer.current = null
    }
  }, [])

  const goBackToOrigin = useCallback(() => {
    const snap = viewOriginRef.current
    if (!snap) return
    viewOriginRef.current = null
    setHasViewBack(false)
    setBackKind(null)
    pendingLocateScroll.current = null
    pendingJumpScroll.current = null
    pendingFocusTarget.current = null
    pendingViewFit.current = null
    fitZoomPending.current = false
    clearJumpHighlights()
    onClearLocate?.()
    pendingRestoreScroll.current = {
      left: snap.scrollLeft,
      top: snap.scrollTop,
    }
    setExpandedBoards(new Set(snap.boards))
    setExpandedEquip(new Set(snap.equip))
    if (zoomRef.current !== snap.zoom) {
      onZoomChange(snap.zoom)
    }
    setRestoreNonce((n) => n + 1)
  }, [clearJumpHighlights, onClearLocate, onZoomChange])

  const expandAll = useCallback(() => {
    viewOriginRef.current = null
    setHasViewBack(false)
    setBackKind(null)
    pendingRestoreScroll.current = null
    pendingFocusTarget.current = null
    pendingZoomScroll.current = null
    pendingViewFit.current = 'fit'
    fitZoomPending.current = true
    setExpandedBoards(new Set(MSB_BOARD_IDS))
    setExpandedEquip(new Set(allPlantExpandEquipIds()))
  }, [])

  const collapseAll = useCallback(() => {
    viewOriginRef.current = null
    setHasViewBack(false)
    setBackKind(null)
    pendingRestoreScroll.current = null
    pendingFocusTarget.current = null
    pendingZoomScroll.current = null
    pendingViewFit.current = 'zoom100'
    fitZoomPending.current = true
    centerPending.current = true
    // Evitar caja w×h del despliegue anterior; forzar 100 % ya
    setPlantSize({ w: 0, h: 0 })
    onZoomChange(1)
    setExpandedBoards(new Set())
    setExpandedEquip(new Set())
  }, [onZoomChange])

  useImperativeHandle(
    ref,
    () => ({
      expandAll,
      collapseAll,
      goBack: goBackToOrigin,
    }),
    [expandAll, collapseAll, goBackToOrigin],
  )

  const showBalloonAt = useCallback((circuit: Circuit, rect: DOMRect) => {
    const { x, y } = placeCircuitBalloon(rect)
    setBalloon({ circuit, x, y })
  }, [])

  const hideBalloon = useCallback(() => setBalloon(null), [])

  const onLocalBreaker = useCallback(
    (circuit: Circuit, e: ReactMouseEvent) => {
      e.stopPropagation()
      if (lockTool === 'lock') {
        onLockCircuit(circuit.id)
        return
      }
      if (lockTool === 'unlock') {
        onUnlockCircuit(circuit.id)
        return
      }
      onToggleProtection(circuit.id)
    },
    [lockTool, onLockCircuit, onUnlockCircuit, onToggleProtection],
  )

  const onJumpToCircuit = useCallback((circuit: Circuit) => {
    if (isPendingFeed(circuit)) return

    if (!viewOriginRef.current) {
      const stage = panRef.current
      viewOriginRef.current = {
        boards: [...expandedBoardsRef.current],
        equip: [...expandedEquipRef.current],
        zoom: zoomRef.current,
        scrollLeft: stage?.scrollLeft ?? 0,
        scrollTop: stage?.scrollTop ?? 0,
      }
      setHasViewBack(true)
      setBackKind('jump')
    }

    // Revelar la cadena hasta el origen de la acometida remota (SSB/LCS/…)
    // y abrir ese origen para ver la instancia LOCAL del interruptor.
    const path = getPlantRevealPath(circuit.originId, system690)
    const boardsToOpen = new Set<BoardId>(path.boardIds)
    const equipToOpen = new Set<string>(path.expandEquipIds)

    pendingJumpScroll.current = circuit.id
    fitZoomPending.current = false

    if (boardsToOpen.size) {
      setExpandedBoards((prev) => {
        const next = new Set(prev)
        for (const id of boardsToOpen) next.add(id)
        return next
      })
    }
    if (equipToOpen.size) {
      setExpandedEquip((prev) => {
        const next = new Set(prev)
        for (const id of equipToOpen) next.add(id)
        return next
      })
    }
    // Dispara el centrado + resaltado tras el layout (mismo mecanismo que localizar).
    setJumpNonce((n) => n + 1)
  }, [])

  /** Restaurar scroll de la vista previa tras Volver. */
  useLayoutEffect(() => {
    if (!pendingRestoreScroll.current) return
    let cancelled = false
    const delays = [0, 40, 120, 280, 500]
    const tryRestore = (i: number) => {
      if (cancelled) return
      const snap = pendingRestoreScroll.current
      const stage = panRef.current
      if (snap && stage) {
        stage.scrollLeft = snap.left
        stage.scrollTop = snap.top
        if (i + 1 >= delays.length) {
          pendingRestoreScroll.current = null
          return
        }
      }
      if (i + 1 < delays.length) {
        window.setTimeout(
          () => tryRestore(i + 1),
          delays[i + 1]! - delays[i]!,
        )
      }
    }
    const t = window.setTimeout(() => tryRestore(0), delays[0])
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [restoreNonce, expandedBoards, expandedEquip, zoom])

  const [boardPopa, boardProa] = boards

  return (
    <div className="casc" ref={stageRef} onClick={() => setBalloon(null)}>
      {hasViewBack && !focus && (
        <div
          className={`casc__focus-bar casc__focus-bar--overlay${
            locateEquipmentId || backKind === 'locate'
              ? ' casc__focus-bar--locate'
              : ' casc__focus-bar--jump'
          }`}
        >
          <span>
            {locateEquipmentId ? (
              <>
                Localizado en unifilar: <strong>{locateEquipmentId}</strong>
              </>
            ) : (
              'Vista de acometida remota'
            )}
          </span>
          <button type="button" className="btn" onClick={goBackToOrigin}>
            Volver
          </button>
        </div>
      )}
      {focus && (
        <div className="casc__focus-bar casc__focus-bar--overlay casc__focus-bar--feeds">
          <span>
            Árbol de alimentaciones: <strong>{focus.equipmentId}</strong>
          </span>
          {onClearFocus && (
            <button type="button" className="btn" onClick={onClearFocus}>
              Volver al unifilar
            </button>
          )}
        </div>
      )}

      <div
        className="casc__stage casc__stage--plant casc__stage--pan"
        ref={panRef}
      >
        {focus ? (
          <div
            className="plant-zoom-space plant-zoom-space--focus"
            style={{
              width: plantSize.w ? plantSize.w * zoom : undefined,
              height: plantSize.h ? plantSize.h * zoom : undefined,
            }}
          >
            <div
              ref={plantRef}
              className="plant-zoom-space__focus-inner"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <SearchTreeView
                equipmentId={focus.equipmentId}
                trace={focus.trace}
                protectionStatus={protectionStatus}
                lockedCircuits={lockedCircuits}
                energizedCircuitIds={energizedCircuitIds}
                energizedEquipmentIds={energizedEquipmentIds}
                onBreaker={onLocalBreaker}
              />
            </div>
          </div>
        ) : (
        <div
          className="plant-zoom-space"
          style={{
            width: plantSize.w ? plantSize.w * zoom : undefined,
            height: plantSize.h ? plantSize.h * zoom : undefined,
          }}
        >
          <div
            ref={plantRef}
            className="plant"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
          <BoardColumn
            board={boardPopa}
            expanded={expandedBoards.has(boardPopa.id)}
            expandedEquip={expandedEquip}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            energizedBusHalves={energizedBusHalves}
            runningGenerators={runningGenerators}
            lockedCircuits={lockedCircuits}
            focusCircuitIds={focusCircuitIds}
            focusEquipmentIds={focusEquipmentIds}
            locateEquipmentId={locateEquipmentId}
            tieSide="right"
            onToggle={() => toggleBoard(boardPopa.id)}
            onToggleEquip={toggleEquip}
            onLocalBreaker={onLocalBreaker}
            onJumpToCircuit={onJumpToCircuit}
            onHoverInfo={showBalloonAt}
            onHoverInfoEnd={hideBalloon}
            onToggleGenerator={onToggleGenerator}
          />

          {/* Separador entre cuadros; la U 2SA↔1SB (QT2A↔QT1B) la dibuja el SVG medido */}
          <div className="plant__bridge-gap" aria-hidden />

          <BoardColumn
            board={boardProa}
            expanded={expandedBoards.has(boardProa.id)}
            expandedEquip={expandedEquip}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            energizedBusHalves={energizedBusHalves}
            runningGenerators={runningGenerators}
            lockedCircuits={lockedCircuits}
            focusCircuitIds={focusCircuitIds}
            focusEquipmentIds={focusEquipmentIds}
            locateEquipmentId={locateEquipmentId}
            tieSide="left"
            onToggle={() => toggleBoard(boardProa.id)}
            onToggleEquip={toggleEquip}
            onLocalBreaker={onLocalBreaker}
            onJumpToCircuit={onJumpToCircuit}
            onHoverInfo={showBalloonAt}
            onHoverInfoEnd={hideBalloon}
            onToggleGenerator={onToggleGenerator}
          />

          {ties.qt2a && ties.qt1b && (
            <BusTieInterconnect
              leftId={ties.qt2a.id}
              rightId={ties.qt1b.id}
              flowing={
                energizedCircuitIds.has(ties.qt2a.id) &&
                energizedCircuitIds.has(ties.qt1b.id)
              }
              zoom={zoom}
              plantRef={plantRef}
              layoutKey={`${plantSize.w}x${plantSize.h}-${[...expandedBoards].join(',')}`}
            />
          )}
          </div>
        </div>
        )}
      </div>

      {balloon && (
        <CircuitBalloon
          circuit={balloon.circuit}
          state={protectionStatus[balloon.circuit.id]}
          x={balloon.x}
          y={balloon.y}
          fixed
          onClose={() => setBalloon(null)}
        />
      )}
    </div>
  )
},
)

function BoardColumn({
  board,
  expanded,
  expandedEquip,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  energizedBusHalves,
  runningGenerators,
  lockedCircuits,
  focusCircuitIds,
  focusEquipmentIds,
  locateEquipmentId,
  tieSide,
  onToggle,
  onToggleEquip,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
  onToggleGenerator,
}: {
  board: BoardModel
  expanded: boolean
  expandedEquip: Set<string>
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  energizedBusHalves: Map<string, Set<'SA' | 'SB'>>
  runningGenerators: Set<string>
  lockedCircuits: Set<string>
  focusCircuitIds: Set<string> | null
  focusEquipmentIds: Set<string> | null
  locateEquipmentId?: string | null
  /** Lado del puente: POPA=right (2SA), PROA=left (1SB). Ambos cuadros: SB | SA */
  tieSide: 'left' | 'right'
  onToggle: () => void
  onToggleEquip: (id: string) => void
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  onToggleGenerator: (genId: string) => void
}) {
  let sb = board.feeders.filter((f) => f.half === 'SB')
  let sa = board.feeders.filter((f) => f.half === 'SA')

  if (focusCircuitIds) {
    const keep = (f: FeederOutlet) =>
      focusCircuitIds.has(f.circuit.id) ||
      (focusEquipmentIds?.has(f.equipment.id) ?? false)
    sb = sb.filter(keep)
    sa = sa.filter(keep)
  }

  const tagB = halfTag(board.id, 'SB')
  const tagA = halfTag(board.id, 'SA')
  const genSb = board.gens.find((g) => g.half === 'SB')
  const genSa = board.gens.find((g) => g.half === 'SA')
  /** Orden fijo SB | SA. QT en el lado del puente: 2SA (derecha) ↔ 1SB (izquierda). */
  const tie = board.busTie[0]
  const tieTag = tieSide === 'left' ? tagB : tagA

  const showBoard =
    !focusCircuitIds ||
    sb.length > 0 ||
    sa.length > 0 ||
    board.gens.some(
      (g) =>
        focusCircuitIds.has(g.breaker.id) ||
        focusEquipmentIds?.has(g.gen.id),
    ) ||
    (tie != null && focusCircuitIds.has(tie.id))

  if (!showBoard) return null

  const renderDrops = (feeders: FeederOutlet[]) =>
    feeders.map((f) => (
      <div key={f.circuit.id} className="hbus__slot">
        <BusDrop
          circuit={f.circuit}
          equipment={f.equipment}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
          expanded={expandedEquip.has(f.equipment.id)}
          expandedEquip={expandedEquip}
          onToggleEquip={onToggleEquip}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          focusCircuitIds={focusCircuitIds}
          locateEquipmentId={locateEquipmentId}
        />
      </div>
    ))

  const genFlowing = (breakerId: string) => energizedCircuitIds.has(breakerId)

  const renderGenOutside = (
    half: BusHalf,
    tag: string,
    genEntry: BoardModel['gens'][number] | undefined,
  ) => {
    if (!genEntry) {
      return (
        <div className="plant-msb__half-out">
          <span className="plant-rack__half-tag">{tag}</span>
        </div>
      )
    }
    const flowing = genFlowing(genEntry.breaker.id)
    const running = runningGenerators.has(genEntry.gen.id)
    return (
      <div className="plant-msb__half-out">
        <span className="plant-rack__half-tag">{tag}</span>
        <div
          className={`plant-msb__gen-leg${flowing ? ' plant-msb__gen-leg--flow' : ''}${running ? ' plant-msb__gen-leg--running' : ''}`}
        >
          <GenSymbol
            short={genShortLabel(half, board.id)}
            title={`${genEntry.gen.id} · ${genEntry.gen.name}`}
            running={running}
            equipmentId={genEntry.gen.id}
            located={locateEquipmentId === genEntry.gen.id}
            onToggle={() => onToggleGenerator(genEntry.gen.id)}
          />
          <div
            className={`plant-msb__vwire plant-msb__vwire--into-box${flowing ? ' plant-msb__vwire--flow' : ''}`}
          />
        </div>
      </div>
    )
  }

  const renderQgInside = (
    genEntry: BoardModel['gens'][number] | undefined,
  ) => {
    if (!genEntry) return <div className="plant-msb__qg-slot" />
    const flowing = genFlowing(genEntry.breaker.id)
    return (
      <div
        className={`plant-msb__qg-slot${flowing ? ' plant-msb__qg-slot--flow' : ''}`}
      >
        <div
          className={`plant-msb__vwire plant-msb__vwire--from-gen${flowing ? ' plant-msb__vwire--flow' : ''}`}
        />
        <BreakerChip
          name={genEntry.breaker.protectionName}
          state={protectionStatus[genEntry.breaker.id]}
          circuitId={genEntry.breaker.id}
          circuit={genEntry.breaker}
          flowing={flowing}
          locked={lockedCircuits.has(genEntry.breaker.id)}
          compact
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          onClick={(e) => onLocalBreaker(genEntry.breaker, e)}
        />
        <div
          className={`plant-msb__vwire plant-msb__vwire--to-rail${flowing ? ' plant-msb__vwire--flow' : ''}`}
        />
      </div>
    )
  }

  const tieFlowing = tie ? energizedCircuitIds.has(tie.id) : false

  const leftGen = genSb
  const rightGen = genSa
  const leftTag = tagB
  const rightTag = tagA
  const leftHalf: BusHalf = 'SB'
  const rightHalf: BusHalf = 'SA'
  const leftDrops = sb
  const rightDrops = sa
  const liveHalves = energizedBusHalves.get(board.id) ?? new Set<'SA' | 'SB'>()
  const leftHalfLive = liveHalves.has(leftHalf)
  const rightHalfLive = liveHalves.has(rightHalf)
  const qbtLive = energizedCircuitIds.has(board.sectionCoupler.id)
  const msbAux24Feeds = aux24FeedsForEquipment(system690, board.id)

  const toggleBoard = (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggle()
  }

  return (
    <div
      className={`plant-msb-col plant-msb-col--tie-${tieSide}`}
      data-board={board.id as BoardId}
      aria-label={`Doble clic para ${expanded ? 'plegar' : 'desplegar'} el cuadro`}
      onDoubleClick={(e) => {
        const t = e.target
        if (
          t instanceof Element &&
          t.closest(
            '.casc-brk, .casc-gen, .hbus-drop, .hbus-drop__eq, button.casc-brk, .hbus-drop__leg--aux',
          )
        ) {
          return
        }
        toggleBoard(e)
      }}
    >
      <button
        type="button"
        className="plant-msb__head"
        aria-label={`Doble clic para ${expanded ? 'plegar' : 'desplegar'}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={toggleBoard}
      >
        <span className="plant-msb__chev">{expanded ? '▾' : '▸'}</span>
        <span className="plant-msb__id">{board.id}</span>
        <span className="plant-msb__name">{board.name}</span>
        <span className="plant-msb__meta">
          {sb.length + sa.length}
          {focusCircuitIds ? ` / ${board.feeders.length}` : ''} salidas · doble
          clic · {expanded ? 'plegar' : 'desplegar'}
        </span>
      </button>

      {/* Generadores fuera del recuadro; clic = arrancar/parar */}
      <div className="plant-msb__outside">
        {renderGenOutside(leftHalf, leftTag, leftGen)}
        <div className="plant-msb__outside-gap" aria-hidden />
        {renderGenOutside(rightHalf, rightTag, rightGen)}
      </div>

      <section className={`plant-msb${expanded ? ' plant-msb--open' : ''}`}>
        {msbAux24Feeds.length > 0 && (
          <div
            className={`plant-msb__aux-tops plant-msb__aux-tops--${tieSide === 'left' ? 'right' : 'left'}`}
            aria-label="Alimentaciones AUX 24 V"
          >
            {msbAux24Feeds.map((aux) => (
              <Aux24Incoming
                key={aux.id}
                circuit={aux}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                lockedCircuits={lockedCircuits}
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                onHoverInfo={onHoverInfo}
                onHoverInfoEnd={onHoverInfoEnd}
              />
            ))}
          </div>
        )}
        <div className="plant-rack">
          <div className="plant-msb__inner-top">
            <div className="plant-msb__qg-row">
              {renderQgInside(leftGen)}
              <div className="plant-msb__qg-gap" aria-hidden />
              {renderQgInside(rightGen)}
            </div>

            {tie && (
              <div
                className={`plant-msb__bustie plant-msb__bustie--${tieSide}${tieFlowing ? ' plant-msb__bustie--flow' : ''}`}
              >
                <BreakerChip
                  name={tie.protectionName}
                  state={protectionStatus[tie.id]}
                  circuitId={tie.id}
                  circuit={tie}
                  flowing={tieFlowing}
                  locked={lockedCircuits.has(tie.id)}
                  compact
                  title={`${tie.protectionName} · interconexión · barra ${tieTag}`}
                  onHoverInfo={onHoverInfo}
                  onHoverInfoEnd={onHoverInfoEnd}
                  onClick={(e) => onLocalBreaker(tie, e)}
                />
                <div className="plant-msb__bustie-down" aria-hidden />
              </div>
            )}
          </div>

          {/* Barra SB ── QBT (horizontal, centrado) ── SA · misma rejilla que las salidas */}
          <div className="plant-rack__rail-wrap">
            <div className="plant-rack__bus-row">
              <div className="plant-rack__bus-half">
                <span className="plant-rack__rail-tag">{leftTag}</span>
                <div
                  className={`plant-rack__rail-seg${leftHalfLive ? ' plant-rack__rail-seg--live' : ''}`}
                  aria-hidden
                />
              </div>
              <div className="plant-rack__coupler plant-rack__coupler--bus">
                <BreakerChip
                  name={board.sectionCoupler.protectionName}
                  state={protectionStatus[board.sectionCoupler.id]}
                  circuitId={board.sectionCoupler.id}
                  circuit={board.sectionCoupler}
                  flowing={qbtLive}
                  locked={lockedCircuits.has(board.sectionCoupler.id)}
                  compact
                  orientation="horizontal"
                  title={`${board.sectionCoupler.name} · acoplador de sección (horizontal en barra)`}
                  onHoverInfo={onHoverInfo}
                  onHoverInfoEnd={onHoverInfoEnd}
                  onClick={(e) => onLocalBreaker(board.sectionCoupler, e)}
                />
              </div>
              <div className="plant-rack__bus-half">
                <span className="plant-rack__rail-tag">{rightTag}</span>
                <div
                  className={`plant-rack__rail-seg${rightHalfLive ? ' plant-rack__rail-seg--live' : ''}`}
                  aria-hidden
                />
              </div>
            </div>

            {expanded && (
              <div className="plant-rack__drops">
                <div className="plant-rack__half-drops">{renderDrops(leftDrops)}</div>
                <div className="plant-rack__coupler-gap" aria-hidden />
                <div className="plant-rack__half-drops">{renderDrops(rightDrops)}</div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}


