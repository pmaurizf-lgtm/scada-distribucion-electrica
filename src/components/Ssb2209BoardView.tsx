/**
 * SSB-2PWS2209 — topología:
 *
 *   NORM → QN → SALIDAS 1
 *   ALT  → QA → Q0T-II ─┐
 *   SALIDAS 1 → Q0T-I ──┴→ SALIDAS 2
 *   SALIDAS 1 → Q03 → barra Q03 → Q03.01…09
 *   SALIDAS 2 → Q01 → UPS → Q02 ─┐
 *   SALIDAS 2 → Q05 ─────────────┴→ SALIDAS 3 → Q05.1…15
 *   SALIDAS 2 → Q04
 *
 * Layout: QN|QA → S1 cortada tras Q0T-I; Q03 | Q0T-I∥Q0T-II → S2/S3.
 */

import {
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { system690 } from '../data/system690'
import type { Circuit, Equipment, ProtectionState } from '../types'
import { hasSsbBoardLayout } from '../abtDownstream/ssbBoard'
import { buildSsb2209Model } from '../abtDownstream/ssb2pws2209'
import {
  feedScopedChildFeeders,
  incomingFeeds,
  isAux24Feed,
  nestableChildFeeders,
} from '../utils/cascadeModel'
import { BreakerChip } from './BreakerChip'
import { EquipmentBusDrop, equipFamOf } from './EquipmentBusDrop'

type SharedProps = {
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit?: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  expandedEquip: Set<string>
  onToggleEquip: (id: string) => void
  focusCircuitIds?: Set<string> | null
  locateEquipmentId?: string | null
  ancestorIds?: ReadonlySet<string>
}

type ChipShared = Pick<
  SharedProps,
  | 'protectionStatus'
  | 'lockedCircuits'
  | 'onLocalBreaker'
  | 'onHoverInfo'
  | 'onHoverInfoEnd'
>

function Wire({
  alt,
  flow,
  kind = 'mid',
}: {
  alt?: boolean
  flow?: boolean
  kind?: 'from' | 'to' | 'mid' | 'stub' | 'grow'
}) {
  return (
    <span
      className={`ssb2209-wire ssb2209-wire--${kind}${alt ? ' ssb2209-wire--alt' : ''}${flow ? ' ssb2209-wire--flow' : ''}`}
      aria-hidden
    />
  )
}

function FlowChip({
  c,
  flowing,
  title,
  ...shared
}: { c: Circuit; flowing: boolean; title?: string } & ChipShared) {
  return (
    <BreakerChip
      name={c.protectionName}
      state={shared.protectionStatus[c.id]}
      compact
      circuitId={c.id}
      circuit={c}
      flowing={flowing}
      locked={shared.lockedCircuits.has(c.id)}
      title={title ?? `${c.protectionName} · ${c.circuitRef ?? c.id}`}
      onClick={(e) => shared.onLocalBreaker(c, e)}
      onHoverInfo={shared.onHoverInfo}
      onHoverInfoEnd={shared.onHoverInfoEnd}
    />
  )
}

function Stack({
  children,
  alt,
  className,
}: {
  children: ReactNode
  alt?: boolean
  className?: string
}) {
  return (
    <div
      className={`ssb2209-stack${alt ? ' ssb2209-stack--alt' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}

function Bus({
  tag,
  live,
  accent,
  className,
  title,
}: {
  tag?: ReactNode
  live: boolean
  accent?: 'ups'
  className?: string
  title?: string
}) {
  return (
    <div
      className={`ssb2209-bus${className ? ` ${className}` : ''}`}
      title={title}
    >
      {tag != null && tag !== '' ? (
        <span className="ssb2209-bus__tag">{tag}</span>
      ) : null}
      <div
        className={`ssb2209-bus__bar${live ? ' ssb2209-bus__bar--live' : ''}${accent === 'ups' ? ' ssb2209-bus__bar--ups' : ''}`}
        aria-hidden
      />
    </div>
  )
}

function BusCaption({ children }: { children: ReactNode }) {
  return <div className="ssb2209-bus-caption">{children}</div>
}

function eqOf(id: string): Equipment | undefined {
  return system690.equipment.find((e) => e.id === id)
}

function LoadOutlet({
  circuit,
  ancestorIds,
  ...shared
}: { circuit: Circuit; ancestorIds: ReadonlySet<string> } & SharedProps) {
  const equipment = eqOf(circuit.destinationId)
  if (!equipment) return null
  if (shared.focusCircuitIds && !shared.focusCircuitIds.has(circuit.id)) {
    return null
  }

  const kids = isAux24Feed(circuit)
    ? []
    : feedScopedChildFeeders(
        nestableChildFeeders(system690, equipment.id, {
          feedParentId: circuit.originId,
          ancestorIds,
        }).filter(
          (x) => !x.equipment.virtual && !hasSsbBoardLayout(x.equipment),
        ),
        circuit,
      )

  const canExpand = !isAux24Feed(circuit) && kids.length > 0
  const expanded = shared.expandedEquip.has(equipment.id)
  const nextAncestors = new Set(ancestorIds)
  nextAncestors.add(equipment.id)

  return (
    <div className="hbus__slot">
      <EquipmentBusDrop
        circuit={circuit}
        equipment={equipment}
        protectionStatus={shared.protectionStatus}
        energizedCircuitIds={shared.energizedCircuitIds}
        energizedEquipmentIds={shared.energizedEquipmentIds}
        lockedCircuits={shared.lockedCircuits}
        onLocalBreaker={shared.onLocalBreaker}
        onJumpToCircuit={shared.onJumpToCircuit}
        onHoverInfo={shared.onHoverInfo}
        onHoverInfoEnd={shared.onHoverInfoEnd}
        canExpand={canExpand}
        expanded={expanded}
        expandLabel={
          canExpand ? `${kids.length} ${expanded ? '▴' : '▾'}` : undefined
        }
        onToggleExpand={
          canExpand ? () => shared.onToggleEquip(equipment.id) : undefined
        }
        equipFam={equipFamOf(equipment)}
        located={shared.locateEquipmentId === equipment.id}
      >
        {expanded && kids.length > 0 && (
          <div className="hbus hbus--nested hbus--direct">
            <div className="hbus__drops">
              {kids.map(({ circuit: c }) => (
                <LoadOutlet
                  key={c.id}
                  circuit={c}
                  ancestorIds={nextAncestors}
                  {...shared}
                />
              ))}
            </div>
          </div>
        )}
      </EquipmentBusDrop>
    </div>
  )
}

function OutletRow({
  circuits,
  ancestorIds,
  ...shared
}: { circuits: Circuit[]; ancestorIds: ReadonlySet<string> } & SharedProps) {
  return (
    <div className="ssb2209-outlets hbus hbus--nested hbus--ssb-section hbus--lcs-section">
      <div className="hbus__drops">
        {circuits.map((c) => (
          <LoadOutlet
            key={c.id}
            circuit={c}
            ancestorIds={ancestorIds}
            {...shared}
          />
        ))}
      </div>
    </div>
  )
}

export function Ssb2209BoardView({
  ssb,
  feed,
  ancestorIds,
  ...shared
}: {
  ssb: Equipment
  feed: Circuit
} & SharedProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const qnRef = useRef<HTMLDivElement>(null)
  const qaRef = useRef<HTMLDivElement>(null)

  /**
   * CONGELADO — acometidas 4Q08→QN y Q03(ALT)→QA
   * Vertical: CSS (to-eq + ::before/::after + risers).
   * Horizontal: ejes en el drop; piernas tops absolutas (NORM/ALT).
   */
  useLayoutEffect(() => {
    const board = boardRef.current
    const qn = qnRef.current
    const qa = qaRef.current
    if (!board || !qn) return

    const drop = board.closest('.hbus-drop--ssb-open') as HTMLElement | null
    const chassis = board.closest('.equip-chassis--ssb') as HTMLElement | null
    if (!drop || !chassis) return

    const tops = drop.querySelector(
      ':scope > .hbus-drop__tops',
    ) as HTMLElement | null
    if (!tops) return

    const sync = () => {
      const d = drop.getBoundingClientRect()
      if (d.width < 1 || drop.offsetWidth < 1) return
      const scale = d.width / drop.offsetWidth

      const qnBox = qn.getBoundingClientRect()
      if (qnBox.width < 4) return

      const c = chassis.getBoundingClientRect()
      const cScale =
        chassis.offsetWidth > 0 ? c.width / chassis.offsetWidth : scale
      chassis.style.setProperty(
        '--ssb2209-axis',
        `${(qnBox.left + qnBox.width / 2 - c.left) / cScale}px`,
      )

      const chassisLeft = (c.left - d.left) / scale
      tops.style.marginLeft = `${Math.max(0, chassisLeft)}px`
      tops.style.width = `${chassis.offsetWidth}px`

      // Ejes respecto al propio tops (evita heredar coords del drop)
      const tBox = tops.getBoundingClientRect()
      const tScale = tops.offsetWidth > 0 ? tBox.width / tops.offsetWidth : scale
      const axisInTops = (el: DOMRect) =>
        (el.left + el.width / 2 - tBox.left) / tScale

      tops.style.setProperty('--ssb2209-qn-axis', `${axisInTops(qnBox)}px`)
      drop.style.setProperty(
        '--ssb2209-qn-axis',
        `${(qnBox.left + qnBox.width / 2 - d.left) / scale}px`,
      )

      if (qa) {
        const qaBox = qa.getBoundingClientRect()
        if (qaBox.width >= 4) {
          tops.style.setProperty('--ssb2209-qa-axis', `${axisInTops(qaBox)}px`)
          drop.style.setProperty(
            '--ssb2209-qa-axis',
            `${(qaBox.left + qaBox.width / 2 - d.left) / scale}px`,
          )
          chassis.style.setProperty(
            '--ssb2209-qa-axis',
            `${(qaBox.left + qaBox.width / 2 - c.left) / cScale}px`,
          )
        }
      }

      // Bajantes hasta el chip (NORM→QN, ALT→QA)
      const stretchTo = (legSel: string, targetTop: number) => {
        const mid = tops.querySelector(
          `${legSel} .hbus-drop__wire--mid`,
        ) as HTMLElement | null
        const toEq = tops.querySelector(
          `${legSel} .hbus-drop__wire--to-eq`,
        ) as HTMLElement | null
        if (!mid || !toEq) return
        const mb = mid.getBoundingClientRect().bottom
        const h = Math.max(24, (targetTop - mb) / scale + 14)
        toEq.style.setProperty('flex-grow', '0', 'important')
        toEq.style.setProperty('flex-shrink', '0', 'important')
        toEq.style.setProperty('flex-basis', `${h}px`, 'important')
        toEq.style.setProperty('min-height', `${h}px`, 'important')
        toEq.style.setProperty('height', `${h}px`, 'important')
      }
      stretchTo('.hbus-drop__leg--norm', qnBox.top)
      if (qa) {
        const qaBox = qa.getBoundingClientRect()
        if (qaBox.width >= 4) stretchTo('.hbus-drop__leg--alt', qaBox.top)
      }
    }

    const schedule = () => requestAnimationFrame(sync)
    sync()
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(qn)
    if (qa) ro.observe(qa)
    ro.observe(board)
    ro.observe(drop)
    window.addEventListener('resize', schedule)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      tops.style.removeProperty('margin-left')
      tops.style.removeProperty('width')
      tops.style.removeProperty('--ssb2209-qn-axis')
      tops.style.removeProperty('--ssb2209-qa-axis')
      drop.style.removeProperty('--ssb2209-qn-axis')
      drop.style.removeProperty('--ssb2209-qa-axis')
      chassis.style.removeProperty('--ssb2209-axis')
      chassis.style.removeProperty('--ssb2209-qa-axis')
    }
  }, [])

  const m = buildSsb2209Model(system690)
  const altIncoming = incomingFeeds(system690, ssb.id).find(
    (c) => !isAux24Feed(c) && c.lineType === 'alternativa',
  )
  const altInFlow = !!(
    altIncoming && shared.energizedCircuitIds.has(altIncoming.id)
  )
  const inFlow = shared.energizedCircuitIds.has(feed.id)
  const qnFlow = !!(m.qn && shared.energizedCircuitIds.has(m.qn.id))
  const qaFlow = !!(m.qa && shared.energizedCircuitIds.has(m.qa.id))
  const qaEntryFlow = altInFlow || qaFlow
  const s1Live = !!(m.s1 && shared.energizedEquipmentIds.has(m.s1.id))
  const s2Live = !!(m.s2 && shared.energizedEquipmentIds.has(m.s2.id))
  const s3Live = !!(m.s3 && shared.energizedEquipmentIds.has(m.s3.id))
  const q03Live = !!(
    m.q03Bus && shared.energizedEquipmentIds.has(m.q03Bus.id)
  )
  const upsLive = !!(m.ups && shared.energizedEquipmentIds.has(m.ups.id))
  const q0tIFlow = !!(m.q0tI && shared.energizedCircuitIds.has(m.q0tI.id))
  const q0tIIFlow = !!(
    m.q0tII && shared.energizedCircuitIds.has(m.q0tII.id)
  )
  const q01Flow = !!(m.q01 && shared.energizedCircuitIds.has(m.q01.id))
  const q02Flow = !!(m.q02 && shared.energizedCircuitIds.has(m.q02.id))
  const q03Flow = !!(m.q03 && shared.energizedCircuitIds.has(m.q03.id))
  const q05Flow = !!(m.q05 && shared.energizedCircuitIds.has(m.q05.id))

  const boardAncestors = new Set(ancestorIds ?? [])
  boardAncestors.add(ssb.id)
  for (const e of [m.s1, m.s2, m.s3, m.q03Bus, m.qaBus, m.ups]) {
    if (e) boardAncestors.add(e.id)
  }

  const chipShared: ChipShared = {
    protectionStatus: shared.protectionStatus,
    lockedCircuits: shared.lockedCircuits,
    onLocalBreaker: shared.onLocalBreaker,
    onHoverInfo: shared.onHoverInfo,
    onHoverInfoEnd: shared.onHoverInfoEnd,
  }

  return (
    <div
      ref={boardRef}
      className={`ssb-board ssb-board--2209${inFlow ? ' ssb-board--fed' : ''}${s1Live || s2Live || s3Live ? ' ssb-board--live' : ''}`}
      data-ssb={ssb.id}
    >
      {/*
        DEFINITIVO: QN centrado en trazo SALIDAS 1 (s1-stack CSS).
        QA sobre Q0T-II. Tops 4Q08/Q03 siguen ejes por JS.
      */}
      <div className="ssb2209-shell">
        {/*
          DEFINITIVO — QN centrado en el trazo de SALIDAS 1 (misma pista
          que la barra tras el gutter del cartel). CSS puro, sin medir.
        */}
        <div className="ssb2209-s1-stack">
          <div className="ssb-board__feed ssb2209-feed-qn" ref={qnRef}>
            <span
              className={`ssb-board__riser${inFlow ? ' ssb-board__riser--flow' : ''}`}
              aria-hidden
            />
            {m.qn && (
              <FlowChip
                c={m.qn}
                flowing={qnFlow}
                title="QN · INS 80 · normal → SALIDAS 1"
                {...chipShared}
              />
            )}
            <span className="hbus-drop__tag hbus-drop__tag--norm">NORM</span>
            <span
              className={`ssb-board__riser ssb-board__riser--to-bus ssb2209-feed-qn__to-bus${qnFlow ? ' ssb-board__riser--flow' : ''}`}
              aria-hidden
            />
          </div>
          <div className="ssb2209-s1-cut">
            <Bus tag="SALIDAS 1 (Sin conmutador)" live={s1Live} />
          </div>
        </div>

        <div className="ssb-board__feed ssb2209-feed-qa" ref={qaRef}>
          <span
            className={`ssb-board__riser ssb-board__riser--alt${qaEntryFlow ? ' ssb-board__riser--flow' : ''}`}
            aria-hidden
          />
          {m.qa && (
            <FlowChip
              c={m.qa}
              flowing={qaFlow}
              title="QA · INS 80 · alternativa → Q0T-II"
              {...chipShared}
            />
          )}
          <span className="hbus-drop__tag hbus-drop__tag--alt">ALT</span>
          <span
            className={`ssb-board__riser ssb-board__riser--alt ssb-board__riser--to-bus ssb2209-feed-qa__to-q0t${qaFlow ? ' ssb-board__riser--flow' : ''}`}
            aria-hidden
          />
        </div>

        <div className="ssb2209-qa-thru" aria-hidden>
          <Wire kind="mid" alt flow={qaFlow} />
        </div>

        <div className="ssb2209-q03-branch__feed">
          <Wire kind="from" flow={s1Live || qnFlow} />
          {m.q03 && (
            <FlowChip
              c={m.q03}
              flowing={q03Flow}
              title="Q03 · SALIDAS 1 → barra Q03"
              {...chipShared}
            />
          )}
          <Wire kind="to" flow={q03Flow} />
        </div>

        <Stack className="ssb2209-a-q0ti">
          <Wire kind="from" flow={s1Live || qnFlow} />
          {m.q0tI && (
            <FlowChip
              c={m.q0tI}
              flowing={q0tIFlow}
              title="Q0T-I · motorizado NORM → SALIDAS 2"
              {...chipShared}
            />
          )}
          <Wire kind="to" flow={q0tIFlow} />
        </Stack>

        <Stack alt className="ssb2209-a-q0tii">
          <Wire kind="from" alt flow={qaFlow} />
          {m.q0tII && (
            <FlowChip
              c={m.q0tII}
              flowing={q0tIIFlow}
              title="Q0T-II · motorizado ALT → SALIDAS 2"
              {...chipShared}
            />
          )}
          <Wire kind="to" alt flow={q0tIIFlow} />
        </Stack>

        <Bus tag="Barra Q03" live={q03Live} className="ssb2209-a-q03bus" />
        <Bus live={s2Live} className="ssb2209-a-s2" />

        <div className="ssb2209-a-q03out">
          <OutletRow
            circuits={m.q03Outlets}
            ancestorIds={boardAncestors}
            {...shared}
          />
        </div>

        <div className="ssb2209-a-s2body">
          <BusCaption>
            SALIDAS 2
            <br />
            (Con conmutador, sin UPS)
          </BusCaption>
          <Stack>
            <Wire kind="from" flow={s2Live} />
            {m.q01 && (
              <FlowChip
                c={m.q01}
                flowing={q01Flow}
                title="Q01 · iC60N 2x10 D · a UPS"
                {...chipShared}
              />
            )}
            <Wire kind="mid" flow={q01Flow} />
            <div
              className={`ssb2209-ups${upsLive ? ' ssb2209-ups--live' : ''}`}
            >
              UPS
            </div>
            <Wire kind="mid" flow={upsLive} />
            {m.q02 && (
              <FlowChip
                c={m.q02}
                flowing={q02Flow}
                title="Q02 · iC60N 2x10 D · UPS → SALIDAS 3"
                {...chipShared}
              />
            )}
            <Wire kind="grow" flow={q02Flow} />
            <Wire kind="to" flow={q02Flow} />
          </Stack>

          {m.q04 && (
            <OutletRow
              circuits={[m.q04]}
              ancestorIds={boardAncestors}
              {...shared}
            />
          )}

          <Stack alt className="ssb2209-stack--to-s3">
            <Wire kind="from" alt flow={s2Live} />
            {m.q05 && (
              <FlowChip
                c={m.q05}
                flowing={q05Flow}
                title="Q05 · iC60N 2x10 D · bypass → SALIDAS 3"
                {...chipShared}
              />
            )}
            <Wire kind="grow" alt flow={q05Flow} />
            <Wire kind="to" alt flow={q05Flow} />
          </Stack>
        </div>

        <div className="ssb2209-a-s3block">
          <Bus live={s3Live} accent="ups" className="ssb2209-a-s3" />
          <div className="ssb2209-a-s3out">
            <BusCaption>
              SALIDAS 3
              <br />
              (Con conmutador y UPS)
            </BusCaption>
            <OutletRow
              circuits={m.s3Outlets}
              ancestorIds={boardAncestors}
              {...shared}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
