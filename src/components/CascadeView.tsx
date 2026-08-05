import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
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
import { EquipmentBalloon } from './EquipmentBalloon'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
import { SearchTreeView } from './SearchTreeView'

export type LockTool = 'none' | 'lock' | 'unlock'

export interface CascadeFocus {
  equipmentId: string
  trace: UpstreamTrace
}

interface CascadeViewProps {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  lockTool: LockTool
  zoom: number
  onZoomChange: (zoom: number) => void
  focus: CascadeFocus | null
  onToggleProtection: (circuitId: string) => boolean | void
  onLockCircuit: (circuitId: string) => void
  onUnlockCircuit: (circuitId: string) => void
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

/** Candado rojo solo cuando el interruptor está bloqueado (LOTO) */
function BreakerChip({
  name,
  state,
  onClick,
  compact,
  circuitId,
  flowing,
  locked,
  title,
}: {
  name: string
  state?: ProtectionState
  onClick?: (e: ReactMouseEvent) => void
  compact?: boolean
  circuitId?: string
  flowing?: boolean
  locked?: boolean
  title?: string
}) {
  const open = state !== 'cerrada'
  return (
    <button
      type="button"
      className={`casc-brk${state ? ` casc-brk--${state}` : ''}${compact ? ' casc-brk--compact' : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}`}
      onClick={onClick}
      title={
        title ??
        `Interruptor motorizado ${name} · ${open ? 'abierto' : 'cerrado'}${locked ? ' · BLOQUEADO' : ''}`
      }
      data-circuit-id={circuitId}
    >
      <span className="casc-brk__sym">
        <MotorizedBreakerSymbol state={state} />
      </span>
      {locked && <LockBadge />}
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
  lockedCircuits,
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
  lockedCircuits: Set<string>
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
      <div className="hbus__rail-wrap" aria-hidden>
        <div className="hbus__rail" />
      </div>
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
  lockedCircuits: Set<string>
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
  const [eqHover, setEqHover] = useState(false)

  const childItems = useMemo(() => {
    const all = children.map(({ circuit: c, equipment: eq }) => ({
      key: c.id,
      circuit: c,
      equipment: eq,
    }))
    if (!focusCircuitIds) return all
    return all.filter((it) => focusCircuitIds.has(it.circuit.id))
  }, [children, focusCircuitIds])

  const feedSummaries = useMemo(
    () =>
      feeds.map((f) => ({
        name: f.protectionName,
        lineType: f.lineType,
        originId: f.originId,
      })),
    [feeds],
  )

  const renderLeg = (
    feed: Circuit,
    kind: 'local' | 'remote',
  ) => {
    const isAlt = feed.lineType === 'alternativa'
    const flowing = energizedCircuitIds.has(feed.id)
    return (
      <div
        key={feed.id}
        className={`hbus-drop__leg hbus-drop__leg--${kind}${isAlt ? ' hbus-drop__leg--alt' : ' hbus-drop__leg--norm'}${flowing ? ' hbus-drop__leg--flow' : ''}`}
        data-circuit-id={kind === 'local' ? feed.id : undefined}
        data-remote-circuit={kind === 'remote' ? feed.id : undefined}
        title={
          kind === 'remote'
            ? `Alimentación ${lineBadge(feed.lineType)} desde ${feed.originId}. Pulsa el interruptor para ir a ese alimentador.`
            : undefined
        }
      >
        {kind === 'remote' ? (
          <span className="hbus-drop__free-end" aria-hidden />
        ) : (
          <span
            className="hbus-drop__wire hbus-drop__wire--from-bus"
            aria-hidden
          />
        )}
        <BreakerChip
          name={feed.protectionName}
          state={protectionStatus[feed.id]}
          compact
          circuitId={feed.id}
          flowing={flowing}
          locked={lockedCircuits.has(feed.id)}
          title={
            kind === 'remote'
              ? `Ir a ${feed.protectionName} en ${feed.originId}`
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation()
            if (kind === 'remote') onJumpToCircuit(feed)
            else onLocalBreaker(feed, e)
          }}
        />
        <span className="hbus-drop__wire hbus-drop__wire--mid" aria-hidden />
        <span
          className={`hbus-drop__tag${isAlt ? ' hbus-drop__tag--alt' : ' hbus-drop__tag--norm'}`}
        >
          {lineBadge(feed.lineType)}
        </span>
        {/* Cada pierna baja hasta el equipo (sin barra horizontal de empalme) */}
        <span
          className={`hbus-drop__wire hbus-drop__wire--to-eq${flowing ? ' hbus-drop__wire--flow' : ''}`}
          aria-hidden
        />
      </div>
    )
  }

  return (
    <div
      className={`hbus-drop${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}${remoteFeeds.length > 0 ? ' hbus-drop--dual' : ''}`}
      data-equip={equipment.id}
      data-circuit-id={localFeed.id}
    >
      <div className="hbus-drop__tops">
        {remoteFeeds.map((remote) => renderLeg(remote, 'remote'))}
        {renderLeg(localFeed, 'local')}
      </div>

      <div
        className="hbus-drop__eq-wrap"
        onMouseEnter={() => setEqHover(true)}
        onMouseLeave={() => setEqHover(false)}
      >
        <button
          type="button"
          className={`hbus-drop__eq${expanded ? ' hbus-drop__eq--open' : ''}${eqEnergized ? ' hbus-drop__eq--live' : ''}`}
          data-equip={equipment.id}
          onClick={onToggleEquip}
          disabled={!canExpand}
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
        {eqHover && (
          <EquipmentBalloon equipment={equipment} feeds={feedSummaries} />
        )}
      </div>

      {expanded && childItems.length > 0 && (
        <HorizontalBus
          nested
          label={equipment.id}
          items={childItems}
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          lockedCircuits={lockedCircuits}
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

/** U invertida QT2A ↔ QT1B anclada a la geometría real de los interruptores */
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

export function CascadeView({
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  lockTool,
  zoom,
  onZoomChange,
  focus,
  onToggleProtection,
  onLockCircuit,
  onUnlockCircuit,
  onClearFocus,
}: CascadeViewProps) {
  const boards = useMemo(() => buildBoardModels(system690), [])
  const ties = useMemo(() => busTieCircuits(system690), [])
  const stageRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<HTMLDivElement>(null)
  const plantRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  /** Tras zoom con rueda: reposicionar scroll para fijar el punto bajo el puntero */
  const pendingZoomScroll = useRef<{ left: number; top: number } | null>(null)
  /** Tras plegar/desplegar MSB: ajustar zoom al viewport */
  const fitZoomPending = useRef(true)
  const [plantSize, setPlantSize] = useState({ w: 0, h: 0 })
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
    fitZoomPending.current = true
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

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-equip="${focus.equipmentId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    })
  }, [focus])

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
        'button, a, input, select, textarea, label, .casc-brk, .circuit-balloon',
      )

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractive(e.target)) return
      dragging = true
      moved = false
      startX = e.clientX
      startY = e.clientY
      originLeft = el.scrollLeft
      originTop = el.scrollTop
      el.classList.add('is-panning')
      el.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      el.scrollLeft = originLeft - dx
      el.scrollTop = originTop - dy
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      el.classList.remove('is-panning')
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (moved) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const onWheel = (e: WheelEvent) => {
      // Zoom con la rueda hacia el puntero (sin Ctrl)
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
      const plantX = (el.scrollLeft + offsetX) / current
      const plantY = (el.scrollTop + offsetY) / current

      pendingZoomScroll.current = {
        left: plantX * next - offsetX,
        top: plantY * next - offsetY,
      }
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

  useLayoutEffect(() => {
    const pending = pendingZoomScroll.current
    const el = panRef.current
    if (!pending || !el) return
    pendingZoomScroll.current = null
    el.scrollLeft = pending.left
    el.scrollTop = pending.top
  }, [zoom])

  useEffect(() => {
    const el = plantRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setPlantSize({ w: el.offsetWidth, h: el.offsetHeight })
    })
    ro.observe(el)
    setPlantSize({ w: el.offsetWidth, h: el.offsetHeight })
    return () => ro.disconnect()
  }, [expandedBoards, focus, expandedEquip])

  /** Zoom dinámico: encajar el unifilar en el área visible al plegar/desplegar */
  useLayoutEffect(() => {
    if (!fitZoomPending.current) return
    const stage = panRef.current
    if (!stage || plantSize.w < 8 || plantSize.h < 8) return

    const pad = 28
    const availW = Math.max(stage.clientWidth - pad, 80)
    const availH = Math.max(stage.clientHeight - pad, 80)
    const fit = Math.min(availW / plantSize.w, availH / plantSize.h)
    const next = Math.min(
      2.5,
      Math.max(0.25, Math.round(fit * 100) / 100),
    )
    fitZoomPending.current = false
    if (Math.abs(next - zoomRef.current) >= 0.01) {
      onZoomChange(next)
    }
    // Centrar tras ajustar
    requestAnimationFrame(() => {
      const s = panRef.current
      if (!s) return
      s.scrollLeft = Math.max(0, (s.scrollWidth - s.clientWidth) / 2)
      s.scrollTop = Math.max(0, (s.scrollHeight - s.clientHeight) / 2)
    })
  }, [plantSize, expandedBoards, focus, onZoomChange])

  // Si cambia el tamaño del viewport, reajustar cuando el usuario no ha hecho zoom manual reciente
  useEffect(() => {
    const stage = panRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      fitZoomPending.current = true
      // dispara el efecto de fit vía plantSize “tocándolo”
      setPlantSize((ps) => ({ ...ps }))
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  const toggleBoard = (id: string) => {
    fitZoomPending.current = true
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleEquip = (id: string) => {
    fitZoomPending.current = true
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
      if (lockTool === 'lock') {
        onLockCircuit(circuit.id)
        showBalloon(circuit, e)
        return
      }
      if (lockTool === 'unlock') {
        onUnlockCircuit(circuit.id)
        showBalloon(circuit, e)
        return
      }
      onToggleProtection(circuit.id)
      showBalloon(circuit, e)
    },
    [
      lockTool,
      onLockCircuit,
      onUnlockCircuit,
      onToggleProtection,
      showBalloon,
    ],
  )

  const onJumpToCircuit = useCallback((circuit: Circuit) => {
    const boardId = boardFromOrigin(circuit.originId)
    if (boardId) {
      setExpandedBoards((prev) => new Set(prev).add(boardId))
    }

    const focusOrigin = () => {
      // Instancia LOCAL del alimentador (no el chip remoto desde el que saltamos)
      const drop = document.querySelector(
        `.hbus-drop[data-circuit-id="${circuit.id}"]`,
      ) as HTMLElement | null
      const localBrk = (drop?.querySelector(
        `.hbus-drop__leg--local [data-circuit-id="${circuit.id}"]`,
      ) ??
        drop?.querySelector(
          `.hbus-drop__leg--local[data-circuit-id="${circuit.id}"]`,
        )) as HTMLElement | null

      const target = localBrk ?? drop
      if (!target) return false

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
      const flashEl = localBrk ?? target
      flashEl.classList.add('casc-brk--flash')
      window.setTimeout(() => {
        flashEl.classList.remove('casc-brk--flash')
      }, 1600)
      return true
    }

    requestAnimationFrame(() => {
      if (!focusOrigin()) {
        window.setTimeout(focusOrigin, 120)
      }
    })
  }, [])

  const [boardPopa, boardProa] = boards

  return (
    <div className="casc" ref={stageRef} onClick={() => setBalloon(null)}>
      {focus && (
        <div className="casc__focus-bar casc__focus-bar--overlay">
          <span>
            Búsqueda: <strong>{focus.equipmentId}</strong> · árbol de
            alimentaciones
          </span>
          {onClearFocus && (
            <button type="button" className="btn" onClick={onClearFocus}>
              Ver planta completa
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
            className="plant-zoom-space"
            style={{
              width: plantSize.w ? plantSize.w * zoom : undefined,
              height: plantSize.h ? plantSize.h * zoom : undefined,
            }}
          >
            <div
              ref={plantRef}
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
            lockedCircuits={lockedCircuits}
            focusCircuitIds={focusCircuitIds}
            focusEquipmentIds={focusEquipmentIds}
            tieSide="right"
            onToggle={() => toggleBoard(boardPopa.id)}
            onToggleEquip={toggleEquip}
            onLocalBreaker={onLocalBreaker}
            onJumpToCircuit={onJumpToCircuit}
          />

          {/* Separador entre cuadros; la U QT2A↔QT1B la dibuja el SVG medido */}
          <div className="plant__bridge-gap" aria-hidden />

          <BoardColumn
            board={boardProa}
            expanded={expandedBoards.has(boardProa.id)}
            expandedEquip={expandedEquip}
            protectionStatus={protectionStatus}
            energizedCircuitIds={energizedCircuitIds}
            energizedEquipmentIds={energizedEquipmentIds}
            lockedCircuits={lockedCircuits}
            focusCircuitIds={focusCircuitIds}
            focusEquipmentIds={focusEquipmentIds}
            tieSide="left"
            onToggle={() => toggleBoard(boardProa.id)}
            onToggleEquip={toggleEquip}
            onLocalBreaker={onLocalBreaker}
            onJumpToCircuit={onJumpToCircuit}
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
  lockedCircuits,
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
  lockedCircuits: Set<string>
  focusCircuitIds: Set<string> | null
  focusEquipmentIds: Set<string> | null
  /** Lado que mira al puente: POPA=right (2SA), PROA=left (1SA espejado) */
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
  /** PROA espejado: SA queda hacia el puente (izquierda) */
  const mirror = tieSide === 'left'
  const tie = board.busTie[0]
  const tieTag = tagA

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
          onToggleEquip={() => onToggleEquip(f.equipment.id)}
          onLocalBreaker={onLocalBreaker}
          onJumpToCircuit={onJumpToCircuit}
          focusCircuitIds={focusCircuitIds}
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
    return (
      <div className="plant-msb__half-out">
        <span className="plant-rack__half-tag">{tag}</span>
        <div
          className={`plant-msb__gen-leg${flowing ? ' plant-msb__gen-leg--flow' : ''}`}
        >
          <GenSymbol
            short={genShortLabel(half, board.id)}
            title={`${genEntry.gen.id} · ${genEntry.gen.name}`}
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
          flowing={flowing}
          locked={lockedCircuits.has(genEntry.breaker.id)}
          compact
          onClick={(e) => onLocalBreaker(genEntry.breaker, e)}
        />
        <div
          className={`plant-msb__vwire plant-msb__vwire--to-rail${flowing ? ' plant-msb__vwire--flow' : ''}`}
        />
      </div>
    )
  }

  const tieFlowing = tie ? energizedCircuitIds.has(tie.id) : false

  const leftGen = mirror ? genSa : genSb
  const rightGen = mirror ? genSb : genSa
  const leftTag = mirror ? tagA : tagB
  const rightTag = mirror ? tagB : tagA
  const leftHalf: BusHalf = mirror ? 'SA' : 'SB'
  const rightHalf: BusHalf = mirror ? 'SB' : 'SA'
  const leftDrops = mirror ? sa : sb
  const rightDrops = mirror ? sb : sa

  return (
    <div
      className={`plant-msb-col plant-msb-col--tie-${tieSide}${mirror ? ' plant-msb-col--mirror' : ''}`}
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

      {/* Generadores fuera del recuadro; cable continuo entra al MSB */}
      <div className="plant-msb__outside">
        {renderGenOutside(leftHalf, leftTag, leftGen)}
        <div className="plant-msb__outside-gap" aria-hidden />
        {renderGenOutside(rightHalf, rightTag, rightGen)}
      </div>

      <section className={`plant-msb${expanded ? ' plant-msb--open' : ''}`}>
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
                {/* La bajante desde el puente llega por arriba (plant__bridge-legs) */}
                <BreakerChip
                  name={tie.protectionName}
                  state={protectionStatus[tie.id]}
                  circuitId={tie.id}
                  flowing={tieFlowing}
                  locked={lockedCircuits.has(tie.id)}
                  compact
                  title={`${tie.protectionName} · interconexión · barra ${tieTag}`}
                  onClick={(e) => onLocalBreaker(tie, e)}
                />
                <div className="plant-msb__bustie-down" aria-hidden />
              </div>
            )}
          </div>

          <div className="plant-rack__rail-wrap">
            <div
              className={`plant-rack__rail${
                energizedEquipmentIds.has(board.id)
                  ? ' plant-rack__rail--live'
                  : ''
              }`}
              aria-hidden
            />
            <div className="plant-rack__rail-labels">
              <span className="plant-rack__rail-tag">{leftTag}</span>
              <div className="plant-rack__coupler">
                <BreakerChip
                  name={board.sectionCoupler.protectionName}
                  state={protectionStatus[board.sectionCoupler.id]}
                  circuitId={board.sectionCoupler.id}
                  flowing={energizedCircuitIds.has(board.sectionCoupler.id)}
                  locked={lockedCircuits.has(board.sectionCoupler.id)}
                  compact
                  title={`${board.sectionCoupler.name} · acoplador de sección`}
                  onClick={(e) => onLocalBreaker(board.sectionCoupler, e)}
                />
              </div>
              <span className="plant-rack__rail-tag">{rightTag}</span>
            </div>

            {expanded && (
              <div className="plant-rack__drops">
                <div className="plant-rack__half-drops">{renderDrops(leftDrops)}</div>
                <div className="plant-rack__coupler-drop" aria-hidden>
                  <div className="hbus-drop__wire hbus-drop__wire--from-bus" />
                </div>
                <div className="plant-rack__half-drops">{renderDrops(rightDrops)}</div>
              </div>
            )}
          </div>
        </div>
      </section>
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
