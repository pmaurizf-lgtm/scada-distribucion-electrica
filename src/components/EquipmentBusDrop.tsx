import {
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
  incomingFeeds,
  isPendingFeed,
  lineBadge,
} from '../utils/cascadeModel'
import { isSpareEquipment } from '../utils/spareCircuits'
import { BreakerChip } from './BreakerChip'
import { EquipmentBalloon } from './EquipmentBalloon'

export type EquipFam = 'abt' | 'trf' | 'lcs' | 'sec' | 'eq'

export function symbolFor(kind: Equipment['kind']): ReactNode {
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

export function equipFamOf(equipment: Equipment, isLcs?: boolean): EquipFam {
  if (equipment.id.startsWith('ABT-')) return 'abt'
  if (equipment.id.startsWith('TRF-')) return 'trf'
  if (isLcs || equipment.id.startsWith('LCS-')) return 'lcs'
  if (equipment.kind === 'cuadro_secundario') return 'sec'
  if (equipment.kind === 'conversion') return 'trf'
  return 'eq'
}

export interface EquipmentBusDropProps {
  circuit: Circuit
  equipment: Equipment
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit?: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  canExpand?: boolean
  expanded?: boolean
  /** Texto del chevron (p. ej. `1 ▾`, `▾ LCS`). */
  expandLabel?: string
  onToggleExpand?: () => void
  equipFam?: EquipFam
  bankNote?: string
  /** Clases extra en el contenedor `.hbus-drop`. */
  rootClassName?: string
  /**
   * Sin interruptor de acometida: solo cable vertical desde el padre
   * (p. ej. ABT → TRF en cadena directa).
   */
  linkOnlyFromParent?: boolean
  /** Equipo localizado por el buscador del unifilar (halo). */
  located?: boolean
  children?: ReactNode
}

/**
 * Bajante unifilar compartido MSB / LCS:
 * piernas NORM/ALT + BreakerChip + tarjeta (símbolo, PUMA, DCP-10, nombre).
 */
export function EquipmentBusDrop({
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
  canExpand = false,
  expanded = false,
  expandLabel,
  onToggleExpand,
  equipFam = 'eq',
  bankNote,
  rootClassName,
  linkOnlyFromParent = false,
  located = false,
  children,
}: EquipmentBusDropProps) {
  const spare = isSpareEquipment(equipment) || !!circuit.spare
  const feeds = useMemo(
    () => (spare ? [circuit] : incomingFeeds(system690, equipment.id)),
    [spare, circuit, equipment.id],
  )
  const localFeed = feeds.find((c) => c.id === circuit.id) ?? circuit
  /**
   * Doble alimentación: hay ALT o pendiente en el destino.
   * - Vista desde NORM → muestra patas remotas ALT / pendiente.
   * - Vista desde ALT (o pendiente) → también la NORM remota.
   * Varios NORM sin ALT (p. ej. TBX bajo dos LCS) no son doble acometida.
   */
  const isDualDestination = feeds.some(
    (c) => c.lineType === 'alternativa' || isPendingFeed(c),
  )
  const localIsAltSide =
    localFeed.lineType === 'alternativa' || isPendingFeed(localFeed)
  const remoteFeeds = isDualDestination
    ? feeds.filter((c) => {
        if (c.id === localFeed.id) return false
        if (c.lineType === 'alternativa' || isPendingFeed(c)) return true
        return localIsAltSide && c.lineType === 'normal'
      })
    : []
  const dual = remoteFeeds.length > 0
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

  const displayFeeds = useMemo(
    () => [localFeed, ...remoteFeeds],
    [localFeed, remoteFeeds],
  )

  const feedSummaries = useMemo(
    () =>
      displayFeeds.map((f) => ({
        name: f.protectionName,
        lineType: f.lineType,
        originId: f.originId,
      })),
    [displayFeeds],
  )

  const toggleExpand = (e: ReactMouseEvent) => {
    if (!canExpand || !onToggleExpand) return
    e.preventDefault()
    e.stopPropagation()
    onToggleExpand()
  }

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
        <BreakerChip
          name={feed.protectionName}
          state={protectionStatus[feed.id]}
          compact
          circuitId={feed.id}
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
          onHoverInfo={onHoverInfo}
          onHoverInfoEnd={onHoverInfoEnd}
          onClick={(e) => {
            e.stopPropagation()
            if (kind === 'remote') {
              if (!pending) onJumpToCircuit?.(feed)
              return
            }
            onLocalBreaker(feed, e)
          }}
        />
        <span className="hbus-drop__wire hbus-drop__wire--mid" aria-hidden />
        {dual && (
          <span
            className={`hbus-drop__tag${isAlt ? ' hbus-drop__tag--alt' : ' hbus-drop__tag--norm'}`}
          >
            {lineBadge(feed.lineType)}
          </span>
        )}
        <span
          className={`hbus-drop__wire hbus-drop__wire--to-eq${flowing ? ' hbus-drop__wire--flow' : ''}`}
          aria-hidden
        />
      </div>
    )
  }

  return (
    <div
      className={`hbus-drop hbus-drop--fam-${equipFam}${isAltLocal ? ' hbus-drop--alt' : ''}${localFlowing ? ' hbus-drop--flow' : ''}${eqEnergized ? ' hbus-drop--live' : ''}${dual ? ' hbus-drop--dual' : ''}${canExpand ? ' hbus-drop--expandable' : ''}${spare ? ' hbus-drop--spare' : ''}${linkOnlyFromParent ? ' hbus-drop--link-only' : ''}${located ? ' hbus-drop--locate' : ''}${rootClassName ? ` ${rootClassName}` : ''}`}
      data-equip={equipment.id}
      data-locate={located ? '1' : undefined}
      data-circuit-id={localFeed.id}
      title={
        spare
          ? `${localFeed.protectionName} · RESPETO (reserva)`
          : canExpand
            ? `${equipment.id} · doble clic para ${expanded ? 'plegar' : 'desplegar'}`
            : undefined
      }
      onDoubleClick={toggleExpand}
    >
      {linkOnlyFromParent ? null : (
        <div className="hbus-drop__tops">
          {remoteFeeds.map((remote) => renderLeg(remote, 'remote'))}
          {renderLeg(localFeed, 'local')}
        </div>
      )}

      <div
        ref={eqWrapRef}
        className="hbus-drop__eq-wrap"
        onMouseEnter={() => setEqHover(true)}
        onMouseLeave={() => setEqHover(false)}
      >
        <button
          type="button"
          className={`hbus-drop__eq hbus-drop__eq--fam-${equipFam}${expanded ? ' hbus-drop__eq--open' : ''}${eqEnergized ? ' hbus-drop__eq--live' : ''}${spare ? ' hbus-drop__eq--spare' : ''}`}
          data-equip={equipment.id}
          title={
            spare
              ? `${localFeed.protectionName} · interruptor de reserva (RESPETO)`
              : canExpand
                ? `Doble clic para ${expanded ? 'plegar' : 'desplegar'} salidas`
                : undefined
          }
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={toggleExpand}
          disabled={!canExpand}
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
          {bankNote && (
            <span className="hbus-drop__bank" title={bankNote}>
              690/440-230
            </span>
          )}
          {canExpand && (
            <span className="hbus-drop__more">
              {expandLabel ?? `${expanded ? '▴' : '▾'}`}
            </span>
          )}
        </button>
        {showEqBalloon && (
          <EquipmentBalloon
            equipment={equipment}
            feeds={feedSummaries}
            circuits={displayFeeds}
            anchorRef={eqWrapRef}
          />
        )}
      </div>

      {children}
    </div>
  )
}
