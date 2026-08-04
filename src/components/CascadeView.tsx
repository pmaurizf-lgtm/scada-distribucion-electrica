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
  childFeeders,
  incomingFeeds,
  lineBadge,
  type BoardModel,
  type FeederOutlet,
} from '../utils/cascadeModel'
import { CircuitBalloon } from './CircuitBalloon'

interface CascadeViewProps {
  protectionStatus: Record<string, ProtectionState>
}

function GenSymbol({ label, title }: { label: string; title: string }) {
  return (
    <div className="casc-gen" title={title}>
      <svg viewBox="0 0 72 88" className="casc-gen__svg" aria-hidden>
        <line
          x1="36"
          y1="4"
          x2="36"
          y2="18"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <circle
          cx="36"
          cy="44"
          r="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <text
          x="36"
          y="50"
          textAnchor="middle"
          fontSize="22"
          fontFamily="IBM Plex Sans, sans-serif"
          fontWeight="600"
          fill="currentColor"
        >
          G
        </text>
        <line
          x1="36"
          y1="68"
          x2="36"
          y2="84"
          stroke="currentColor"
          strokeWidth="2.5"
        />
      </svg>
      <span className="casc-gen__label">{label}</span>
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

/** Barra horizontal con salidas colgando (estilo unifilar de cuadro) */
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
}) {
  return (
    <div className={`hbus${nested ? ' hbus--nested' : ''}`}>
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

export function CascadeView({ protectionStatus }: CascadeViewProps) {
  const boards = useMemo(() => buildBoardModels(system690), [])
  const stageRef = useRef<HTMLDivElement>(null)
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(
    () => new Set(['MSB-6PWS0001']),
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

  return (
    <div className="casc" ref={stageRef} onClick={() => setBalloon(null)}>
      <header className="casc__intro">
        <h2>Planta eléctrica 690 V · vista en cascada</h2>
        <p>
          Al desplegar un cuadro o un CCM, las salidas se muestran en barra
          horizontal (estilo unifilar). Pulsa un interruptor para ver P/Q/S/I y
          modelo. Ejemplo: CCM-6PWS0003 cuelga de Q1A03 (NORM) y Q2B02 (ALT).
        </p>
      </header>

      <div className="casc__stage">
        <div className="casc__gens">
          {boards.map((board) => (
            <div key={board.id} className="casc__gen-col">
              {board.gens.map(({ half, gen, breaker }) => (
                <div key={gen.id} className="casc__gen-block">
                  <GenSymbol
                    label={gen.id.replace('SDG-', '')}
                    title={gen.name}
                  />
                  <div className="casc__vline" />
                  <BreakerChip
                    name={breaker.protectionName}
                    state={protectionStatus[breaker.id]}
                    onClick={(e) => openBreaker(breaker, e)}
                  />
                  <div className="casc__vline" />
                  <span className="casc__half-tag">
                    {half === 'SA'
                      ? board.id.endsWith('1')
                        ? '1SA'
                        : '2SA'
                      : board.id.endsWith('1')
                        ? '1SB'
                        : '2SB'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="casc__tie-row">
          <div className="casc__tie-line" />
          {boards[0].busTie.map((c) => (
            <BreakerChip
              key={c.id}
              name={c.protectionName}
              state={protectionStatus[c.id]}
              onClick={(e) => openBreaker(c, e)}
            />
          ))}
          <span className="casc__tie-label">Bus-tie N-1 ↔ N-2</span>
          <div className="casc__tie-line" />
        </div>

        <div className="casc__boards casc__boards--stack">
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              expanded={expandedBoards.has(board.id)}
              expandedEquip={expandedEquip}
              protectionStatus={protectionStatus}
              onToggle={() => toggleBoard(board.id)}
              onToggleEquip={toggleEquip}
              onBreaker={openBreaker}
            />
          ))}
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

function BoardCard({
  board,
  expanded,
  expandedEquip,
  protectionStatus,
  onToggle,
  onToggleEquip,
  onBreaker,
}: {
  board: BoardModel
  expanded: boolean
  expandedEquip: Set<string>
  protectionStatus: Record<string, ProtectionState>
  onToggle: () => void
  onToggleEquip: (id: string) => void
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
}) {
  const sa = board.feeders.filter((f) => f.half === 'SA')
  const sb = board.feeders.filter((f) => f.half === 'SB')
  const tagA = board.id.endsWith('1') ? '1SA' : '2SA'
  const tagB = board.id.endsWith('1') ? '1SB' : '2SB'
  const ordered: FeederOutlet[] = [...sa, ...sb]
  const couplerAfter = sa.length - 1

  return (
    <section className={`casc-board${expanded ? ' casc-board--open' : ''}`}>
      <button type="button" className="casc-board__head" onClick={onToggle}>
        <span className="casc-board__chev">{expanded ? '▾' : '▸'}</span>
        <span className="casc-board__id">{board.id}</span>
        <span className="casc-board__name">{board.name}</span>
        <span className="casc-board__meta">
          {board.feeders.length} salidas · {expanded ? 'plegar' : 'desplegar'}
        </span>
      </button>

      {!expanded && (
        <div className="casc-bus casc-bus--collapsed">
          <div className="casc-bus__seg casc-bus__seg--a">
            <span>{tagA}</span>
          </div>
          <div className="casc-bus__coupler" title={board.sectionCoupler.label}>
            <span className="casc-brk__box casc-brk__box--static" />
            <span>{board.sectionCoupler.id}</span>
          </div>
          <div className="casc-bus__seg casc-bus__seg--b">
            <span>{tagB}</span>
          </div>
        </div>
      )}

      {expanded && (
        <div className="casc-board__body">
          <HorizontalBus
            label={`${board.id} · ${tagA} | ${board.sectionCoupler.id} | ${tagB}`}
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
