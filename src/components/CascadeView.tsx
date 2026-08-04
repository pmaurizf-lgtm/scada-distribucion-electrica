import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import {
  boardFromOrigin,
  buildBoardModels,
  busTieCircuits,
  childFeeders,
  incomingFeeds,
  lineBadge,
  type BoardId,
  type BoardModel,
  type BusHalf,
  type FeederOutlet,
} from '../utils/cascadeModel'
import type { UpstreamTrace } from '../utils/upstream'
import { CircuitBalloon } from './CircuitBalloon'

export interface CascadeFocus {
  equipmentId: string
  trace: UpstreamTrace
}

interface CascadeViewProps {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  focus: CascadeFocus | null
  onToggleProtection: (circuitId: string) => void
  onClearFocus?: () => void
}

function halfTag(boardId: string, half: BusHalf): string {
  const n = boardId.endsWith('1') ? '1' : '2'
  return `${n}${half}`
}

function GenSymbol({ short, title }: { short: string; title: string }) {
  return (
    <div className="casc-gen" title={title}>
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
          fill="none"
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
    </div>
  )
}

/** Candado abierto (verde) = circuito abierto; cerrado (rojo) = cerrado/energizado */
function PadlockIcon({ state }: { state?: ProtectionState }) {
  const closed = state === 'cerrada'
  const color = closed ? 'var(--prot-closed)' : 'var(--prot-open)'
  return (
    <svg
      className="casc-brk__lock"
      viewBox="0 0 16 18"
      width="14"
      height="16"
      aria-hidden
    >
      {closed ? (
        <>
          <rect
            x="2"
            y="8"
            width="12"
            height="9"
            rx="1.5"
            fill={color}
            stroke="currentColor"
            strokeWidth="1"
          />
          <path
            d="M5 8V5.5a3 3 0 0 1 6 0V8"
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
        </>
      ) : (
        <>
          <rect
            x="2"
            y="8"
            width="12"
            height="9"
            rx="1.5"
            fill={color}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.9"
          />
          <path
            d="M5 8V5.5a3 3 0 0 1 5.5-1.5"
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

function BreakerChip({
  name,
  state,
  onClick,
  compact,
  circuitId,
  flowing,
  title,
}: {
  name: string
  state?: ProtectionState
  onClick?: (e: ReactMouseEvent) => void
  compact?: boolean
  circuitId?: string
  flowing?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`casc-brk${state ? ` casc-brk--${state}` : ''}${compact ? ' casc-brk--compact' : ''}${flowing ? ' casc-brk--flow' : ''}`}
      onClick={onClick}
      title={
        title ??
        `Interruptor ${name} · ${state === 'cerrada' ? 'cerrado' : 'abierto'}`
      }
      data-circuit-id={circuitId}
    >
      <PadlockIcon state={state} />
      <span className="casc-brk__name">{name}</span>
    </button>
  )
}

function HorizontalBus({
  label,
  voltage = 'salidas',
  items,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  expandedEquip,
  onToggleEquip,
  onLocalBreaker,
  onJumpToCircuit,
  nested,
  focusCircuitIds,
}: {
  label: string
  voltage?: string
  items: { key: string; circuit: Circuit; equipment: Equipment }[]
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  expandedEquip?: Set<string>
  onToggleEquip?: (id: string) => void
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit: (c: Circuit) => void
  nested?: boolean
  focusCircuitIds?: Set<string> | null
}) {
  const list = focusCircuitIds
    ? items.filter((it) => focusCircuitIds.has(it.circuit.id))
    : items

  return (
    <div className={`hbus${nested ? ' hbus--nested' : ''}`}>
      <div className="hbus__title">
        <strong>{label}</strong>
        <span>{voltage}</span>
      </div>
      <div className="hbus__rail-wrap">
        <div className="hbus__rail" aria-hidden />
        <div className="hbus__drops">
          {list.map((item) => (
            <div key={item.key} className="hbus__slot">
              <BusDrop
                circuit={item.circuit}
                equipment={item.equipment}
                protectionStatus={protectionStatus}
                energizedCircuitIds={energizedCircuitIds}
                energizedEquipmentIds={energizedEquipmentIds}
                expanded={expandedEquip?.has(item.equipment.id) ?? false}
                onToggleEquip={
                  onToggleEquip
                    ? () => onToggleEquip(item.equipment.id)
                    : undefined
                }
                onLocalBreaker={onLocalBreaker}
                onJumpToCircuit={onJumpToCircuit}
                focusCircuitIds={focusCircuitIds}
              />
            </div>
          ))}
        </div>
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
  expanded,
  onToggleEquip,
  onLocalBreaker,
  onJumpToCircuit,
  focusCircuitIds,
}: {
  circuit: Circuit
  equipment: Equipment
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  expanded: boolean
  onToggleEquip?: () => void
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit: (c: Circuit) => void
  focusCircuitIds?: Set<string> | null
}) {
  const children = useMemo(
    () => childFeeders(system690, equipment.id),
    [equipment.id],
  )
  const feeds = useMemo(
    () => incomingFeeds(system690, equipment.id),
    [equipment.id],
  )
  const [innerOpen, setInnerOpen] = useState<Set<string>>(new Set())
  const canExpand = children.length > 0 && !!onToggleEquip

  const localFeed = feeds.find((c) => c.id === circuit.id) ?? circuit
  const remoteFeeds = feeds.filter((c) => c.id !== localFeed.id)

  const localFlowing = energizedCircuitIds.has(localFeed.id)
  const eqEnergized = energizedEquipmentIds.has(equipment.id)
  const isAltLocal = localFeed.lineType === 'alternativa'

  const childItems = useMemo(() => {
    const all = children.map(({ circuit: c, equipment: eq }) => ({
      key: c.id,
      circuit: c,
      equipment: eq,
    }))
    if (!focusCircuitIds) return all
    return all.filter((it) => focusCircuitIds.has(it.circuit.id))
  }, [children, focusCircuitIds])

  return (
    <div
      className={`hbus-drop${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}`}
      data-equip={equipment.id}
      data-circuit-id={localFeed.id}
    >
      {/* Alimentaciones por arriba: remotas flotantes + local unida a barra */}
      <div className="hbus-drop__tops">
        {remoteFeeds.map((remote) => (
          <div
            key={remote.id}
            className={`hbus-drop__remote${remote.lineType === 'alternativa' ? ' hbus-drop__remote--alt' : ''}${energizedCircuitIds.has(remote.id) ? ' hbus-drop__remote--flow' : ''}`}
            title={`Alimentación ${lineBadge(remote.lineType)} desde ${remote.originId}. Pulsa para ir a esa barra.`}
          >
            <div className="hbus-drop__remote-stub" aria-hidden />
            <BreakerChip
              name={remote.protectionName}
              state={protectionStatus[remote.id]}
              compact
              circuitId={remote.id}
              flowing={energizedCircuitIds.has(remote.id)}
              title={`Ir a ${remote.protectionName} en ${remote.originId}`}
              onClick={(e) => {
                e.stopPropagation()
                onJumpToCircuit(remote)
              }}
            />
            <div className="hbus-drop__remote-cable" aria-hidden />
            <span className="hbus-drop__remote-badge">
              {lineBadge(remote.lineType)}
            </span>
          </div>
        ))}

        <div className="hbus-drop__local">
          <div
            className={`hbus-drop__stem${localFlowing ? ' hbus-drop__stem--flow' : ''}`}
            aria-hidden
          />
          <BreakerChip
            name={localFeed.protectionName}
            state={protectionStatus[localFeed.id]}
            compact
            circuitId={localFeed.id}
            flowing={localFlowing}
            onClick={(e) => onLocalBreaker(localFeed, e)}
          />
          <div
            className={`hbus-drop__stem hbus-drop__stem--short${localFlowing ? ' hbus-drop__stem--flow' : ''}`}
            aria-hidden
          />
          <span className="hbus-drop__local-badge">
            {lineBadge(localFeed.lineType)}
          </span>
        </div>
      </div>

      <button
        type="button"
        className={`hbus-drop__eq${expanded ? ' hbus-drop__eq--open' : ''}${eqEnergized ? ' hbus-drop__eq--live' : ''}`}
        data-equip={equipment.id}
        onClick={onToggleEquip}
        disabled={!canExpand}
        title={equipment.name}
      >
        <span className="hbus-drop__sym">{symbolFor(equipment.kind)}</span>
        <span className="hbus-drop__id">{equipment.id}</span>
        <span className="hbus-drop__name">{equipment.name}</span>
        {canExpand && (
          <span className="hbus-drop__more">
            {children.length} {expanded ? '▴' : '▾'}
          </span>
        )}
      </button>

      {expanded && childItems.length > 0 && (
        <HorizontalBus
          nested
          label={equipment.id}
          items={childItems}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          expandedEquip={innerOpen}
          onToggleEquip={(id) => {
            setInnerOpen((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          focusCircuitIds={focusCircuitIds}
        />
      )}
    </div>
  )
}

function genShortLabel(half: BusHalf, boardId: string): string {
  const n = boardId.endsWith('1') ? '1' : '2'
  return `G${n}${half === 'SA' ? 'A' : 'B'}`
}

export function CascadeView({
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  focus,
  onToggleProtection,
  onClearFocus,
}: CascadeViewProps) {
  const boards = useMemo(() => buildBoardModels(system690), [])
  const ties = useMemo(() => busTieCircuits(system690), [])
  const stageRef = useRef<HTMLDivElement>(null)
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(
    () => new Set(['MSB-6PWS0002', 'MSB-6PWS0001']),
  )
  const [expandedEquip, setExpandedEquip] = useState<Set<string>>(new Set())
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
    if (!focus) return
    const boardsToOpen = new Set<string>()
    for (const c of focus.trace.circuits) {
      const b = boardFromOrigin(c.originId)
      if (b) boardsToOpen.add(b)
      const bd = boardFromOrigin(c.destinationId)
      if (bd) boardsToOpen.add(bd)
    }
    // También por equipos MSB
    for (const id of focus.trace.equipmentIds) {
      if (id.startsWith('MSB-6PWS')) boardsToOpen.add(id)
    }
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      for (const b of boardsToOpen) next.add(b)
      return next
    })

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-equip="${focus.equipmentId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    })
  }, [focus])

  const toggleBoard = (id: string) => {
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleEquip = (id: string) => {
    setExpandedEquip((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const showBalloon = useCallback((circuit: Circuit, e: ReactMouseEvent) => {
    const rect = stageRef.current?.getBoundingClientRect()
    const x = rect ? e.clientX - rect.left + 12 : e.clientX
    const y = rect ? e.clientY - rect.top + 12 : e.clientY
    setBalloon({
      circuit,
      x: Math.max(8, Math.min(x, (rect?.width ?? 800) - 290)),
      y: Math.max(8, Math.min(y, (rect?.height ?? 600) - 320)),
    })
  }, [])

  const onLocalBreaker = useCallback(
    (circuit: Circuit, e: ReactMouseEvent) => {
      e.stopPropagation()
      onToggleProtection(circuit.id)
      showBalloon(circuit, e)
    },
    [onToggleProtection, showBalloon],
  )

  const onJumpToCircuit = useCallback((circuit: Circuit) => {
    const boardId = boardFromOrigin(circuit.originId)
    if (boardId) {
      setExpandedBoards((prev) => new Set(prev).add(boardId))
    }
    requestAnimationFrame(() => {
      const el =
        document.querySelector(`.hbus-drop[data-circuit-id="${circuit.id}"]`) ??
        document.querySelector(
          `.hbus-drop__local [data-circuit-id="${circuit.id}"]`,
        )
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      const brk =
        el?.querySelector?.(`[data-circuit-id="${circuit.id}"]`) ??
        (el as HTMLElement | null)
      brk?.classList.add('casc-brk--flash')
      window.setTimeout(() => {
        brk?.classList.remove('casc-brk--flash')
      }, 1600)
    })
  }, [])

  const [boardPopa, boardProa] = boards

  return (
    <div className="casc" ref={stageRef} onClick={() => setBalloon(null)}>
      <header className="casc__intro">
        <h2>Planta eléctrica 690 V · esquema funcional</h2>
        <p>
          Alimentación local unida a la barra; la de otra barra aparece arriba
          sin conectar (pulsa para ir a su origen). Candado verde = abierto,
          rojo = cerrado. Pulsa un interruptor local para abrir/cerrar y ver el
          flujo.
        </p>
        {focus && (
          <div className="casc__focus-bar">
            <span>
              Búsqueda: <strong>{focus.equipmentId}</strong> ·{' '}
              {focus.trace.circuits.length} alimentaciones aguas arriba
            </span>
            {onClearFocus && (
              <button type="button" className="btn" onClick={onClearFocus}>
                Ver planta completa
              </button>
            )}
          </div>
        )}
      </header>

      <div className="casc__stage casc__stage--plant">
        <div className={`plant${focus ? ' plant--focus' : ''}`}>
          <BoardColumn
            board={boardPopa}
            expanded={expandedBoards.has(boardPopa.id)}
            expandedEquip={expandedEquip}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            focusCircuitIds={focusCircuitIds}
            focusEquipmentIds={focusEquipmentIds}
            tieSide="right"
            onToggle={() => toggleBoard(boardPopa.id)}
            onToggleEquip={toggleEquip}
            onLocalBreaker={onLocalBreaker}
            onJumpToCircuit={onJumpToCircuit}
          />

          <div className="plant__bridge" title="Interconexión cuadros N-2 ↔ N-1">
            <div className="plant__bridge-bar">
              {ties.qt2a && (
                <BreakerChip
                  name={ties.qt2a.protectionName}
                  state={protectionStatus[ties.qt2a.id]}
                  circuitId={ties.qt2a.id}
                  flowing={energizedCircuitIds.has(ties.qt2a.id)}
                  onClick={(e) => onLocalBreaker(ties.qt2a!, e)}
                />
              )}
              <div
                className={`plant__bridge-hwire${
                  ties.qt2a &&
                  ties.qt1b &&
                  energizedCircuitIds.has(ties.qt2a.id) &&
                  energizedCircuitIds.has(ties.qt1b.id)
                    ? ' plant__bridge-hwire--flow'
                    : ''
                }`}
              />
              <span className="plant__bridge-label">INTERCONEXIÓN</span>
              <div
                className={`plant__bridge-hwire${
                  ties.qt2a &&
                  ties.qt1b &&
                  energizedCircuitIds.has(ties.qt2a.id) &&
                  energizedCircuitIds.has(ties.qt1b.id)
                    ? ' plant__bridge-hwire--flow'
                    : ''
                }`}
              />
              {ties.qt1b && (
                <BreakerChip
                  name={ties.qt1b.protectionName}
                  state={protectionStatus[ties.qt1b.id]}
                  circuitId={ties.qt1b.id}
                  flowing={energizedCircuitIds.has(ties.qt1b.id)}
                  onClick={(e) => onLocalBreaker(ties.qt1b!, e)}
                />
              )}
            </div>
            <div className="plant__bridge-down">
              <div className="plant__bridge-rise" />
              <div className="plant__bridge-rise" />
            </div>
          </div>

          <BoardColumn
            board={boardProa}
            expanded={expandedBoards.has(boardProa.id)}
            expandedEquip={expandedEquip}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            focusCircuitIds={focusCircuitIds}
            focusEquipmentIds={focusEquipmentIds}
            tieSide="left"
            onToggle={() => toggleBoard(boardProa.id)}
            onToggleEquip={toggleEquip}
            onLocalBreaker={onLocalBreaker}
            onJumpToCircuit={onJumpToCircuit}
          />
        </div>
      </div>

      {balloon && (
        <CircuitBalloon
          circuit={balloon.circuit}
          state={protectionStatus[balloon.circuit.id]}
          x={balloon.x}
          y={balloon.y}
          onClose={() => setBalloon(null)}
        />
      )}
    </div>
  )
}

function BoardColumn({
  board,
  expanded,
  expandedEquip,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  focusCircuitIds,
  focusEquipmentIds,
  tieSide,
  onToggle,
  onToggleEquip,
  onLocalBreaker,
  onJumpToCircuit,
}: {
  board: BoardModel
  expanded: boolean
  expandedEquip: Set<string>
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  focusCircuitIds: Set<string> | null
  focusEquipmentIds: Set<string> | null
  tieSide: 'left' | 'right'
  onToggle: () => void
  onToggleEquip: (id: string) => void
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit: (c: Circuit) => void
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

  const showBoard =
    !focusCircuitIds ||
    sb.length > 0 ||
    sa.length > 0 ||
    board.gens.some(
      (g) =>
        focusCircuitIds.has(g.breaker.id) ||
        focusEquipmentIds?.has(g.gen.id),
    )

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
          expanded={expandedEquip.has(f.equipment.id)}
          onToggleEquip={() => onToggleEquip(f.equipment.id)}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          focusCircuitIds={focusCircuitIds}
        />
      </div>
    ))

  const genFlowing = (breakerId: string) => energizedCircuitIds.has(breakerId)

  return (
    <section
      className={`plant-msb${expanded ? ' plant-msb--open' : ''} plant-msb--tie-${tieSide}`}
      data-board={board.id as BoardId}
    >
      <button type="button" className="plant-msb__head" onClick={onToggle}>
        <span className="plant-msb__chev">{expanded ? '▾' : '▸'}</span>
        <span className="plant-msb__id">{board.id}</span>
        <span className="plant-msb__name">{board.name}</span>
        <span className="plant-msb__meta">
          {sb.length + sa.length}
          {focusCircuitIds ? ` / ${board.feeders.length}` : ''} salidas ·{' '}
          {expanded ? 'plegar' : 'desplegar'}
        </span>
      </button>

      <div className="plant-rack">
        <div className="plant-rack__spec">690V 3φ 60Hz</div>

        <div className="plant-rack__gens">
          <div className="plant-rack__half-top">
            <span className="plant-rack__half-tag">{tagB}</span>
            {genSb && (
              <div
                className={`plant-msb__gen-leg${genFlowing(genSb.breaker.id) ? ' plant-msb__gen-leg--flow' : ''}`}
              >
                <GenSymbol
                  short={genShortLabel(genSb.half, board.id)}
                  title={`${genSb.gen.id} · ${genSb.gen.name}`}
                />
                <div
                  className={`plant-msb__vwire${genFlowing(genSb.breaker.id) ? ' plant-msb__vwire--flow' : ''}`}
                />
                <BreakerChip
                  name={genSb.breaker.protectionName}
                  state={protectionStatus[genSb.breaker.id]}
                  circuitId={genSb.breaker.id}
                  flowing={genFlowing(genSb.breaker.id)}
                  onClick={(e) => onLocalBreaker(genSb.breaker, e)}
                />
                <div
                  className={`plant-msb__vwire plant-msb__vwire--to-bus${genFlowing(genSb.breaker.id) ? ' plant-msb__vwire--flow' : ''}`}
                />
              </div>
            )}
          </div>

          <div className="plant-rack__coupler-top" aria-hidden />

          <div className="plant-rack__half-top">
            <span className="plant-rack__half-tag">{tagA}</span>
            {genSa && (
              <div
                className={`plant-msb__gen-leg${genFlowing(genSa.breaker.id) ? ' plant-msb__gen-leg--flow' : ''}`}
              >
                <GenSymbol
                  short={genShortLabel(genSa.half, board.id)}
                  title={`${genSa.gen.id} · ${genSa.gen.name}`}
                />
                <div
                  className={`plant-msb__vwire${genFlowing(genSa.breaker.id) ? ' plant-msb__vwire--flow' : ''}`}
                />
                <BreakerChip
                  name={genSa.breaker.protectionName}
                  state={protectionStatus[genSa.breaker.id]}
                  circuitId={genSa.breaker.id}
                  flowing={genFlowing(genSa.breaker.id)}
                  onClick={(e) => onLocalBreaker(genSa.breaker, e)}
                />
                <div
                  className={`plant-msb__vwire plant-msb__vwire--to-bus${genFlowing(genSa.breaker.id) ? ' plant-msb__vwire--flow' : ''}`}
                />
              </div>
            )}
          </div>
        </div>

        <div className="plant-rack__rail-wrap">
          <div
            className={`plant-rack__rail${
              energizedEquipmentIds.has(board.id) ? ' plant-rack__rail--live' : ''
            }`}
            aria-hidden
          />
          <div
            className="plant-rack__coupler"
            title={board.sectionCoupler.label}
          >
            <span className="casc-brk__box casc-brk__box--static" />
            <span>{board.sectionCoupler.id}</span>
          </div>
        </div>

        {expanded && (
          <div className="plant-rack__drops">
            <div className="plant-rack__half-drops">{renderDrops(sb)}</div>
            <div
              className="plant-rack__coupler-drop"
              title={board.sectionCoupler.label}
            >
              <div className="hbus-drop__stem" aria-hidden />
              <span className="casc-brk__box casc-brk__box--static" />
              <span className="hbus__coupler-id">{board.sectionCoupler.id}</span>
            </div>
            <div className="plant-rack__half-drops">{renderDrops(sa)}</div>
          </div>
        )}
      </div>
    </section>
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
