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
}: {
  name: string
  state?: ProtectionState
  onClick?: (e: ReactMouseEvent) => void
}) {
  return (
    <button
      type="button"
      className={`casc-brk${state ? ` casc-brk--${state}` : ''}`}
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
    <div
      className="casc"
      ref={stageRef}
      onClick={() => setBalloon(null)}
    >
      <header className="casc__intro">
        <h2>Planta eléctrica 690 V · vista en cascada</h2>
        <p>
          Arriba → abajo: generadores, interruptores de generador (QG*),
          acoplamiento entre barras (QT1B/QT2A) y cuadros principales. Pulsa un
          MSB para ver salidas 1SA/1SB (o 2SA/2SB). Pulsa un CCM/ABT/… para ver
          sus salidas. Ejemplo: Q1A03 (NORM) y Q2B02 (ALT) alimentan
          CCM-6PWS0003.
        </p>
      </header>

      <div className="casc__stage">
        <div className="casc__gens">
          {boards.map((board) => (
            <div key={board.id} className="casc__gen-col">
              {board.gens.map(({ half, gen, breaker }) => (
                <div key={gen.id} className="casc__gen-block">
                  <GenSymbol label={gen.id.replace('SDG-', '')} title={gen.name} />
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

        <div className="casc__boards">
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

      <div className="casc-bus">
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

      {expanded && (
        <div className="casc-board__body">
          <div className="casc-board__cols">
            <FeederColumn
              title={`${tagA} · salidas`}
              feeders={sa}
              expandedEquip={expandedEquip}
              protectionStatus={protectionStatus}
              onToggleEquip={onToggleEquip}
              onBreaker={onBreaker}
            />
            <FeederColumn
              title={`${tagB} · salidas`}
              feeders={sb}
              expandedEquip={expandedEquip}
              protectionStatus={protectionStatus}
              onToggleEquip={onToggleEquip}
              onBreaker={onBreaker}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function FeederColumn({
  title,
  feeders,
  expandedEquip,
  protectionStatus,
  onToggleEquip,
  onBreaker,
}: {
  title: string
  feeders: FeederOutlet[]
  expandedEquip: Set<string>
  protectionStatus: Record<string, ProtectionState>
  onToggleEquip: (id: string) => void
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
}) {
  return (
    <div className="casc-col">
      <h3>{title}</h3>
      <ul className="casc-outlets">
        {feeders.map((f) => (
          <li key={f.circuit.id}>
            <EquipCascade
              equipment={f.equipment}
              feederCircuit={f.circuit}
              expanded={expandedEquip.has(f.equipment.id)}
              protectionStatus={protectionStatus}
              onToggle={() => onToggleEquip(f.equipment.id)}
              onBreaker={onBreaker}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function EquipCascade({
  equipment,
  feederCircuit,
  expanded,
  protectionStatus,
  onToggle,
  onBreaker,
  depth = 0,
}: {
  equipment: Equipment
  feederCircuit?: Circuit
  expanded: boolean
  protectionStatus: Record<string, ProtectionState>
  onToggle: () => void
  onBreaker: (c: Circuit, e: ReactMouseEvent) => void
  depth?: number
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
  const canExpand = children.length > 0

  return (
    <div className={`casc-eq depth-${Math.min(depth, 3)}`}>
      <div className="casc-eq__row">
        {feederCircuit && (
          <BreakerChip
            name={feederCircuit.protectionName}
            state={protectionStatus[feederCircuit.id]}
            onClick={(e) => onBreaker(feederCircuit, e)}
          />
        )}
        <button
          type="button"
          className={`casc-eq__btn${expanded ? ' casc-eq__btn--open' : ''}`}
          data-equip={equipment.id}
          onClick={onToggle}
          disabled={!canExpand}
        >
          <span className="casc-eq__sym" data-kind={equipment.kind}>
            {symbolFor(equipment.kind)}
          </span>
          <span className="casc-eq__text">
            <strong>{equipment.id}</strong>
            <span>{equipment.name}</span>
          </span>
          {canExpand && (
            <span className="casc-eq__count">{children.length}</span>
          )}
          {canExpand && (
            <span className="casc-eq__chev">{expanded ? '▾' : '▸'}</span>
          )}
        </button>
      </div>

      <div className="casc-eq__feeds">
        {feeds.map((c) => (
          <button
            key={c.id}
            type="button"
            className="casc-eq__feed-btn"
            onClick={(e) => onBreaker(c, e)}
          >
            <FeedBadge circuit={c} />
            <span className="muted">← {c.originId}</span>
          </button>
        ))}
      </div>

      {expanded && children.length > 0 && (
        <ul className="casc-outlets casc-outlets--nested">
          {children.map(({ circuit, equipment: child }) => {
            const open = innerOpen.has(child.id)
            return (
              <li key={circuit.id}>
                <EquipCascade
                  equipment={child}
                  feederCircuit={circuit}
                  expanded={open}
                  protectionStatus={protectionStatus}
                  onToggle={() => {
                    setInnerOpen((prev) => {
                      const next = new Set(prev)
                      if (next.has(child.id)) next.delete(child.id)
                      else next.add(child.id)
                      return next
                    })
                  }}
                  onBreaker={onBreaker}
                  depth={depth + 1}
                />
              </li>
            )
          })}
        </ul>
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
