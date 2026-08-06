import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState, ServiceClass } from '../types'
import {
  buildLcsBoardModel,
  type LcsOutlet,
  type LcsSection,
  type LcsVoltageBus,
} from '../abtDownstream'
import { isSpareEquipment } from '../utils/spareCircuits'
import {
  incomingFeeds,
  isPendingFeed,
  lineBadge,
} from '../utils/cascadeModel'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'
import { EquipmentBalloon } from './EquipmentBalloon'

/**
 * LCS 440 V: mismo criterio visual que salidas MSB (hbus-drop).
 * QVS sobre VS unido a la barra; cargas colgando con piernas NORM/ALT.
 */

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

function equipFamOf(equipment: Equipment): string {
  if (equipment.id.startsWith('ABT-')) return 'abt'
  if (equipment.id.startsWith('TRF-')) return 'trf'
  if (equipment.id.startsWith('LCS-')) return 'lcs'
  if (equipment.kind === 'cuadro_secundario') return 'sec'
  if (equipment.kind === 'conversion') return 'trf'
  return 'eq'
}

function MiniBreaker({
  name,
  state,
  circuit,
  flowing,
  locked,
  orientation = 'vertical',
  title,
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
  title?: string
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
      title={
        title ??
        `Interruptor ${name} · ${open ? 'abierto' : 'cerrado'}${locked ? ' · BLOQUEADO' : ''}`
      }
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

type SharedProps = {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit?: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}

/** Misma pieza visual que BusDrop del MSB (piernas + recuadro). */
function HbusStyleDrop({
  circuit,
  equipment,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  circuit: Circuit
  equipment: Equipment
} & SharedProps) {
  const spare = isSpareEquipment(equipment) || !!circuit.spare
  const feeds = useMemo(
    () => (spare ? [circuit] : incomingFeeds(system690, equipment.id)),
    [spare, circuit, equipment.id],
  )
  const localFeed = feeds.find((c) => c.id === circuit.id) ?? circuit
  const remoteFeeds = feeds.filter((c) => c.id !== localFeed.id)
  const dual = remoteFeeds.length > 0
  const localFlowing = energizedCircuitIds.has(localFeed.id)
  const eqEnergized = energizedEquipmentIds.has(equipment.id)
  const isAltLocal = localFeed.lineType === 'alternativa'
  const fam = spare ? 'eq' : equipFamOf(equipment)
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

  const feedSummaries = feeds.map((f) => ({
    name: f.protectionName,
    lineType: f.lineType,
    originId: f.originId,
  }))

  const renderLeg = (feed: Circuit, kind: 'local' | 'remote') => {
    const isAlt = feed.lineType === 'alternativa'
    const flowing = energizedCircuitIds.has(feed.id)
    const pending = isPendingFeed(feed)
    return (
      <div
        key={feed.id}
        className={`hbus-drop__leg hbus-drop__leg--${kind}${isAlt ? ' hbus-drop__leg--alt' : ' hbus-drop__leg--norm'}${flowing ? ' hbus-drop__leg--flow' : ''}`}
        data-circuit-id={kind === 'local' ? feed.id : undefined}
        data-remote-circuit={kind === 'remote' ? feed.id : undefined}
        title={
          kind === 'remote'
            ? pending
              ? `Alimentación ${lineBadge(feed.lineType)} · origen pendiente de identificar`
              : `Alimentación ${lineBadge(feed.lineType)} desde ${feed.originId}. Pulsa el interruptor para ir a ese alimentador.`
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
        <MiniBreaker
          name={feed.protectionName}
          state={protectionStatus[feed.id]}
          circuit={feed}
          flowing={flowing}
          locked={lockedCircuits.has(feed.id) || pending}
          title={
            kind === 'remote'
              ? pending
                ? `Origen pendiente de identificar (${lineBadge(feed.lineType)})`
                : `Ir a ${feed.protectionName} en ${feed.originId}`
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation()
            if (kind === 'remote') {
              if (!pending) onJumpToCircuit?.(feed)
              return
            }
            onLocalBreaker(feed, e)
          }}
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
        />
        <span className="hbus-drop__wire hbus-drop__wire--mid" aria-hidden />
        <span
          className={`hbus-drop__tag${isAlt ? ' hbus-drop__tag--alt' : ' hbus-drop__tag--norm'}`}
        >
          {lineBadge(feed.lineType)}
        </span>
        <span
          className={`hbus-drop__wire hbus-drop__wire--to-eq${flowing ? ' hbus-drop__wire--flow' : ''}`}
          aria-hidden
        />
      </div>
    )
  }

  return (
    <div
      className={`hbus-drop hbus-drop--fam-${fam}${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}${dual ? ' hbus-drop--dual' : ''}${spare ? ' hbus-drop--spare' : ''}`}
      data-equip={equipment.id}
      data-circuit-id={localFeed.id}
    >
      <div className="hbus-drop__tops">
        {remoteFeeds.map((remote) => renderLeg(remote, 'remote'))}
        {renderLeg(localFeed, 'local')}
      </div>
      <div
        ref={wrapRef}
        className="hbus-drop__eq-wrap"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div
          className={`hbus-drop__eq hbus-drop__eq--fam-${fam}${eqEnergized ? ' hbus-drop__eq--live' : ''}${spare ? ' hbus-drop__eq--spare' : ''}`}
          data-equip={equipment.id}
        >
          <span className="hbus-drop__sym">
            {spare ? 'R' : symbolFor(equipment.kind)}
          </span>
          <span className="hbus-drop__id">
            {spare ? localFeed.protectionName : equipment.id}
          </span>
          {!spare && equipment.dcp10Id && (
            <span className="hbus-drop__dcp" title="Denominación DCP-10">
              {equipment.dcp10Id}
            </span>
          )}
          <span className="hbus-drop__name">
            {spare ? 'RESPETO' : equipment.name}
          </span>
        </div>
        {showBall && (
          <EquipmentBalloon
            equipment={equipment}
            feeds={feedSummaries}
            anchorRef={wrapRef}
          />
        )}
      </div>
    </div>
  )
}

function sectionOf(bus: LcsVoltageBus, service: ServiceClass): LcsSection | undefined {
  return bus.sections.find((s) => s.service === service)
}

function BusDrops({
  outlets,
  ...shared
}: {
  outlets: LcsOutlet[]
} & SharedProps) {
  return (
    <div className="hbus hbus--nested hbus--lcs-section">
      <div className="hbus__drops">
        {outlets.map(({ circuit, equipment }) => (
          <div key={circuit.id} className="hbus__slot">
            <HbusStyleDrop
              circuit={circuit}
              equipment={equipment}
              {...shared}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Barra 440 V: QVS sobre VS — QVM — VM — QNV — NV. */
export function Lcs440Board({
  bus,
  incoming,
  protectionStatus,
  energizedCircuitIds,
  energizedEquipmentIds,
  lockedCircuits,
  onLocalBreaker,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  bus: LcsVoltageBus
  /** QVS: se dibuja sobre la barra VS y baja hasta ella. */
  incoming?: Circuit
} & SharedProps) {
  const vs = sectionOf(bus, 'VS')
  const vm = sectionOf(bus, 'VM')
  const nv = sectionOf(bus, 'NV')
  const feed = incoming ?? bus.incoming
  const inFlow = !!(feed && energizedCircuitIds.has(feed.id))
  const qvm = vm?.sectionBreaker
  const qnv = nv?.sectionBreaker
  const qvmFlow = !!(qvm && energizedCircuitIds.has(qvm.id))
  const qnvFlow = !!(qnv && energizedCircuitIds.has(qnv.id))
  const vsLive = inFlow
  const vmLive = inFlow && qvmFlow
  const nvLive = inFlow && qnvFlow
  const shared = {
    protectionStatus,
    energizedCircuitIds,
    energizedEquipmentIds,
    lockedCircuits,
    onLocalBreaker,
    onJumpToCircuit,
    onHoverInfo,
    onHoverInfoEnd,
  }

  return (
    <div
      className={`lcs440-board${inFlow ? ' lcs440-board--live' : ''}${feed ? ' lcs440-board--fed' : ''}`}
    >
      <div className="lcs440-rail">
        {/* —— Columna VS: QVS unido a la barra —— */}
        {feed ? (
          <div className={`lcs440-vs-feed${inFlow ? ' lcs440-vs-feed--flow' : ''}`}>
            <span
              className={`hbus-drop__wire hbus-drop__wire--from-bus${inFlow ? ' hbus-drop__wire--flow' : ''}`}
              aria-hidden
            />
            <MiniBreaker
              name={feed.protectionName}
              state={protectionStatus[feed.id]}
              circuit={feed}
              flowing={inFlow}
              locked={lockedCircuits.has(feed.id)}
              onClick={(e) => onLocalBreaker(feed, e)}
              onHoverInfo={onHoverInfo}
              onHoverInfoEnd={onHoverInfoEnd}
            />
            <span
              className={`hbus-drop__wire hbus-drop__wire--to-eq${inFlow ? ' hbus-drop__wire--flow' : ''}`}
              aria-hidden
            />
          </div>
        ) : (
          <div className="lcs440-vs-feed lcs440-vs-feed--empty" aria-hidden />
        )}

        <span className="lcs440-cell__tag lcs440-cell__tag--VS lcs440-rail__vs-tag">
          VS 440 V
        </span>
        <div
          className={`lcs440-cell__bus lcs440-rail__vs-bus${vsLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        <div className="lcs440-rail__vs-drops">
          <BusDrops outlets={vs?.outlets ?? []} {...shared} />
        </div>

        {/* —— QVM —— */}
        {qvm ? (
          <div className={`lcs440-tie lcs440-rail__qvm${qvmFlow ? ' lcs440-tie--flow' : ''}`}>
            <span className="lcs440-tie__bridge lcs440-tie__bridge--left" aria-hidden />
            <MiniBreaker
              name={qvm.protectionName}
              state={protectionStatus[qvm.id]}
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
        )}

        {/* —— Columna VM —— */}
        <span className="lcs440-cell__tag lcs440-cell__tag--VM lcs440-rail__vm-tag">
          VM 440 V
        </span>
        <div
          className={`lcs440-cell__bus lcs440-rail__vm-bus${vmLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        <div className="lcs440-rail__vm-drops">
          <BusDrops outlets={vm?.outlets ?? []} {...shared} />
        </div>

        {/* —— QNV —— */}
        {qnv ? (
          <div className={`lcs440-tie lcs440-rail__qnv${qnvFlow ? ' lcs440-tie--flow' : ''}`}>
            <span className="lcs440-tie__bridge lcs440-tie__bridge--left" aria-hidden />
            <MiniBreaker
              name={qnv.protectionName}
              state={protectionStatus[qnv.id]}
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
        )}

        {/* —— Columna NV —— */}
        <span className="lcs440-cell__tag lcs440-cell__tag--NV lcs440-rail__nv-tag">
          NV 440 V
        </span>
        <div
          className={`lcs440-cell__bus lcs440-rail__nv-bus${nvLive ? ' lcs440-cell__bus--live' : ''}`}
        />
        <div className="lcs440-rail__nv-drops">
          <BusDrops outlets={nv?.outlets ?? []} {...shared} />
        </div>
      </div>
    </div>
  )
}

/** Expandir LCS: barras 440 V. */
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
  const board = useMemo(() => {
    const full = buildLcsBoardModel(system690, lcsId)
    if (!full) return null
    const bus440 = full.buses.find((b) => b.voltage === '440')
    if (!bus440) return null
    return { ...full, buses: [bus440] }
  }, [lcsId])

  if (!board) {
    return (
      <div className="lcs-dual lcs-dual--empty">
        Sin datos 440 V para {lcsId}
      </div>
    )
  }

  return (
    <div
      className={`lcs-dual${inline ? ' lcs-dual--inline' : ''}`}
      title={`${board.lcs.id} · ${board.lcs.name}`}
    >
      {!inline && (
        <header className="lcs-dual__head">
          <strong>{board.lcs.id}</strong>
          <span>{board.lcs.name}</span>
          <span className="lcs-dual__meta">
            440 V · VS—QVM—VM—QNV—NV (230 V aparcado)
          </span>
        </header>
      )}
      <Lcs440Board
        bus={board.buses[0]}
        incoming={
          inline ? incoming ?? board.buses[0].incoming : undefined
        }
        {...props}
      />
    </div>
  )
}
