import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import {
  buildBoardModels,
  busTieCircuits,
  childFeeders,
  incomingFeeds,
  lineBadge,
  type BoardModel,
  type BusHalf,
  type FeederOutlet,
} from '../utils/cascadeModel'
import { CircuitBalloon } from './CircuitBalloon'

interface CascadeViewProps {
  protectionStatus: Record<string, ProtectionState>
}

function halfTag(boardId: string, half: BusHalf): string {
  const n = boardId.endsWith('1') ? '1' : '2'
  return `${n}${half}`
}

function GenSymbol({
  short,
  title,
}: {
  short: string
  title: string
}) {
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

function BreakerChip({
  name,
  state,
  onClick,
  compact,
}: {
  name: string
  state?: ProtectionState
  onClick?: (e: ReactMouseEvent) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      className={`casc-brk${state ? ` casc-brk--${state}` : ''}${compact ? ' casc-brk--compact' : ''}`}
      onClick={onClick}
      title={`Interruptor ${name}`}
    >
      <span className="casc-brk__box" aria-hidden />
      <span className="casc-brk__name">{name}</span>
    </button>
  )
}

function FeedBadge({ circuit }: { circuit: Circuit }) {
  return (
    <span className={`casc-feed casc-feed--${circuit.lineType}`}>
      {lineBadge(circuit.lineType)}
      <span className="casc-feed__brk">{circuit.protectionName}</span>
    </span>
  )
}

function HorizontalBus({
  label,
  voltage = '690V 3φ 60Hz',
  items,
  coupler,
  protectionStatus,
  expandedEquip,
  onToggleEquip,
  onBreaker,
  nested,
  compact,
}: {
  label: string
  voltage?: string
  items: {
    key: string
    circuit: Circuit
    equipment: Equipment
  }[]
  coupler?: { id: string; afterIndex: number; title: string }
  protectionStatus: Record<string, ProtectionState>
  expandedEquip?: Set<string>
  onToggleEquip?: (id: string) => void
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  nested?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`hbus${nested ? ' hbus--nested' : ''}${compact ? ' hbus--compact' : ''}`}
    >
      <div className="hbus__title">
        <strong>{label}</strong>
        <span>{voltage}</span>
      </div>

      <div className="hbus__rail-wrap">
        <div className="hbus__rail" aria-hidden />
        <div className="hbus__drops">
          {(() => {
            const nodes: ReactNode[] = []
            const couplerEl = coupler ? (
              <div
                key={`coupler-${coupler.id}`}
                className="hbus__coupler"
                title={coupler.title}
              >
                <div className="hbus-drop__stem" aria-hidden />
                <span className="casc-brk__box casc-brk__box--static" />
                <span className="hbus__coupler-id">{coupler.id}</span>
              </div>
            ) : null

            if (coupler && coupler.afterIndex < 0) nodes.push(couplerEl)

            items.forEach((item, index) => {
              nodes.push(
                <div key={item.key} className="hbus__slot">
                  <BusDrop
                    circuit={item.circuit}
                    equipment={item.equipment}
                    protectionStatus={protectionStatus}
                    expanded={expandedEquip?.has(item.equipment.id) ?? false}
                    onToggleEquip={
                      onToggleEquip
                        ? () => onToggleEquip(item.equipment.id)
                        : undefined
                    }
                    onBreaker={onBreaker}
                  />
                </div>,
              )
              if (coupler && index === coupler.afterIndex) nodes.push(couplerEl)
            })

            return nodes
          })()}
        </div>
      </div>
    </div>
  )
}

function BusDrop({
  circuit,
  equipment,
  protectionStatus,
  expanded,
  onToggleEquip,
  onBreaker,
}: {
  circuit: Circuit
  equipment: Equipment
  protectionStatus: Record<string, ProtectionState>
  expanded: boolean
  onToggleEquip?: () => void
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
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
  const isAlt = circuit.lineType === 'alternativa'

  return (
    <div className={`hbus-drop${isAlt ? ' hbus-drop--alt' : ''}`}>
      <div className="hbus-drop__stem" aria-hidden />
      <BreakerChip
        name={circuit.protectionName}
        state={protectionStatus[circuit.id]}
        compact
        onClick={(e) => onBreaker(circuit, e)}
      />
      <div className="hbus-drop__stem hbus-drop__stem--short" aria-hidden />

      <button
        type="button"
        className={`hbus-drop__eq${expanded ? ' hbus-drop__eq--open' : ''}`}
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

      <div className="hbus-drop__feeds">
        {feeds.map((c) => (
          <button
            key={c.id}
            type="button"
            className="hbus-drop__feed"
            onClick={(e) => onBreaker(c, e)}
          >
            <FeedBadge circuit={c} />
          </button>
        ))}
      </div>

      {expanded && children.length > 0 && (
        <HorizontalBus
          nested
          compact
          label={equipment.id}
          voltage="salidas"
          items={children.map(({ circuit: c, equipment: eq }) => ({
            key: c.id,
            circuit: c,
            equipment: eq,
          }))}
          protectionStatus={protectionStatus}
          expandedEquip={innerOpen}
          onToggleEquip={(id) => {
            setInnerOpen((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onBreaker={onBreaker}
        />
      )}
    </div>
  )
}

function genShortLabel(half: BusHalf, boardId: string): string {
  const n = boardId.endsWith('1') ? '1' : '2'
  return `G${n}${half === 'SA' ? 'A' : 'B'}`
}

export function CascadeView({ protectionStatus }: CascadeViewProps) {
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

  const openBreaker = useCallback((circuit: Circuit, e: ReactMouseEvent) => {
    e.stopPropagation()
    const rect = stageRef.current?.getBoundingClientRect()
    const x = rect ? e.clientX - rect.left + 12 : e.clientX
    const y = rect ? e.clientY - rect.top + 12 : e.clientY
    setBalloon({
      circuit,
      x: Math.max(8, Math.min(x, (rect?.width ?? 800) - 290)),
      y: Math.max(8, Math.min(y, (rect?.height ?? 600) - 320)),
    })
  }, [])

  const [boardPopa, boardProa] = boards

  return (
    <div className="casc" ref={stageRef} onClick={() => setBalloon(null)}>
      <header className="casc__intro">
        <h2>Planta eléctrica 690 V · esquema funcional</h2>
        <p>
          MSB POPA (N-2) a la izquierda y MSB PROA (N-1) a la derecha. Generadores
          unidos a barra por QG*, acoplamiento de sección QT1/QT2 e interconexión
          bus-tie QT2A ↔ QT1B. Despliega un cuadro para ver salidas en barra
          horizontal.
        </p>
      </header>

      <div className="casc__stage casc__stage--plant">
        <div className="plant">
          <BoardColumn
            board={boardPopa}
            expanded={expandedBoards.has(boardPopa.id)}
            expandedEquip={expandedEquip}
            protectionStatus={protectionStatus}
            tieSide="right"
            onToggle={() => toggleBoard(boardPopa.id)}
            onToggleEquip={toggleEquip}
            onBreaker={openBreaker}
          />

          <div className="plant__bridge" title="Interconexión cuadros N-2 ↔ N-1">
            <div className="plant__bridge-bar">
              {ties.qt2a && (
                <BreakerChip
                  name={ties.qt2a.protectionName}
                  state={protectionStatus[ties.qt2a.id]}
                  onClick={(e) => openBreaker(ties.qt2a!, e)}
                />
              )}
              <div className="plant__bridge-hwire" />
              <span className="plant__bridge-label">INTERCONEXIÓN</span>
              <div className="plant__bridge-hwire" />
              {ties.qt1b && (
                <BreakerChip
                  name={ties.qt1b.protectionName}
                  state={protectionStatus[ties.qt1b.id]}
                  onClick={(e) => openBreaker(ties.qt1b!, e)}
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
            tieSide="left"
            onToggle={() => toggleBoard(boardProa.id)}
            onToggleEquip={toggleEquip}
            onBreaker={openBreaker}
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
  tieSide,
  onToggle,
  onToggleEquip,
  onBreaker,
}: {
  board: BoardModel
  expanded: boolean
  expandedEquip: Set<string>
  protectionStatus: Record<string, ProtectionState>
  tieSide: 'left' | 'right'
  onToggle: () => void
  onToggleEquip: (id: string) => void
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
}) {
  const sb = board.feeders.filter((f) => f.half === 'SB')
  const sa = board.feeders.filter((f) => f.half === 'SA')
  const tagB = halfTag(board.id, 'SB')
  const tagA = halfTag(board.id, 'SA')
  /** Orden plano: SB | acoplador | SA */
  const ordered: FeederOutlet[] = [...sb, ...sa]
  const couplerAfter = sb.length - 1

  return (
    <section
      className={`plant-msb${expanded ? ' plant-msb--open' : ''} plant-msb--tie-${tieSide}`}
    >
      <button type="button" className="plant-msb__head" onClick={onToggle}>
        <span className="plant-msb__chev">{expanded ? '▾' : '▸'}</span>
        <span className="plant-msb__id">{board.id}</span>
        <span className="plant-msb__name">{board.name}</span>
        <span className="plant-msb__meta">
          {board.feeders.length} salidas · {expanded ? 'plegar' : 'desplegar'}
        </span>
      </button>

      <div className="plant-msb__gens">
        {board.gens.map(({ half, gen, breaker }) => (
          <div key={gen.id} className="plant-msb__gen-leg">
            <GenSymbol
              short={genShortLabel(half, board.id)}
              title={`${gen.id} · ${gen.name}`}
            />
            <div className="plant-msb__vwire" />
            <BreakerChip
              name={breaker.protectionName}
              state={protectionStatus[breaker.id]}
              onClick={(e) => onBreaker(breaker, e)}
            />
            <div className="plant-msb__vwire plant-msb__vwire--to-bus" />
            <span className="plant-msb__half">{halfTag(board.id, half)}</span>
          </div>
        ))}
      </div>

      <div className="plant-msb__bus" title="Barra 690V">
        <div className="plant-msb__bus-seg">
          <span>{tagB}</span>
        </div>
        <div
          className="plant-msb__coupler"
          title={board.sectionCoupler.label}
        >
          <span className="casc-brk__box casc-brk__box--static" />
          <span>{board.sectionCoupler.id}</span>
        </div>
        <div className="plant-msb__bus-seg">
          <span>{tagA}</span>
        </div>
        <span className="plant-msb__bus-spec">690V 3φ 60Hz</span>
      </div>

      {expanded && (
        <div className="plant-msb__body">
          <HorizontalBus
            compact
            label={`${tagB} | ${board.sectionCoupler.id} | ${tagA}`}
            items={ordered.map((f) => ({
              key: f.circuit.id,
              circuit: f.circuit,
              equipment: f.equipment,
            }))}
            coupler={{
              id: board.sectionCoupler.id,
              afterIndex: couplerAfter,
              title: board.sectionCoupler.label,
            }}
            protectionStatus={protectionStatus}
            expandedEquip={expandedEquip}
            onToggleEquip={onToggleEquip}
            onBreaker={onBreaker}
          />
        </div>
      )}
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
