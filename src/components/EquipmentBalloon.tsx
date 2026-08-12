import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useIsMobileUi } from '../hooks/useIsMobileUi'
import type { Circuit, Equipment } from '../types'
import { originLabel } from '../utils/cascadeModel'
import { labelSecondaryDenom } from '../utils/equipmentLabels'

const KIND_LABEL: Record<Equipment['kind'], string> = {
  generador: 'Generador',
  conversion: 'Conversión',
  cuadro_principal: 'Cuadro principal',
  cuadro_secundario: 'Cuadro secundario',
  consumidor: 'Consumidor',
}

function fmt(n: number | null | undefined, unit: string, digits = 2) {
  if (n == null || Number.isNaN(n)) return null
  return `${n.toFixed(digits)} ${unit}`
}

interface EquipmentBalloonProps {
  equipment: Equipment
  feeds?: { name: string; lineType: string; originId: string }[]
  /** Circuito(s) de alimentación: P/Q/S/In/servicio como en el MSB */
  circuits?: Circuit[]
  /** Ancla del hover (botón/caja del equipo) */
  anchorRef: RefObject<HTMLElement | null>
  /** Móvil: cierre explícito (botón ×). */
  onClose?: () => void
}

export function EquipmentBalloon({
  equipment,
  feeds,
  circuits,
  anchorRef,
  onClose,
}: EquipmentBalloonProps) {
  const isMobile = useIsMobileUi()
  const balloonRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    left: number
    top: number
    place: 'above' | 'below'
    maxHeight: number
  } | null>(null)
  const primary = circuits?.[0]
  const showClose = isMobile && !!onClose

  useLayoutEffect(() => {
    const margin = 10
    /** En móvil fijamos la posición al abrir para poder panear sin perder el globo. */
    let locked: {
      left: number
      top: number
      place: 'above' | 'below'
      maxHeight: number
    } | null = null

    const placeFromAnchor = () => {
      const el = anchorRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const balloon = balloonRef.current
      const bw = balloon?.offsetWidth || Math.min(320, vw - margin * 2)
      const bh = balloon?.offsetHeight || 220

      const spaceAbove = r.top - margin
      const spaceBelow = vh - r.bottom - margin
      let place: 'above' | 'below' =
        spaceAbove >= Math.min(bh, spaceBelow) && spaceAbove >= 120
          ? 'above'
          : spaceBelow >= spaceAbove
            ? 'below'
            : 'above'

      const halfW = bw / 2
      const left = Math.min(
        Math.max(r.left + r.width / 2, margin + halfW),
        vw - margin - halfW,
      )

      let top: number
      let maxHeight: number
      if (place === 'above') {
        top = r.top - 8
        maxHeight = Math.max(140, top - margin)
        if (maxHeight < 140 && spaceBelow > spaceAbove) {
          place = 'below'
          top = r.bottom + 8
          maxHeight = Math.max(140, vh - top - margin)
        }
      } else {
        top = r.bottom + 8
        maxHeight = Math.max(140, vh - top - margin)
        if (maxHeight < 140 && spaceAbove > spaceBelow) {
          place = 'above'
          top = r.top - 8
          maxHeight = Math.max(140, top - margin)
        }
      }

      maxHeight = Math.min(maxHeight, vh - margin * 2)
      return { left, top, place, maxHeight }
    }

    const update = (fromScroll = false) => {
      if (isMobile && locked && fromScroll) return
      if (isMobile && locked && !fromScroll) {
        setPos(locked)
        return
      }
      const next = placeFromAnchor()
      if (!next) return
      if (isMobile && !locked) locked = next
      setPos(next)
    }

    update(false)
    const raf = window.requestAnimationFrame(() => {
      if (isMobile && locked) {
        const el = anchorRef.current
        const balloon = balloonRef.current
        if (!el || !balloon) return
        const r = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const bw = balloon.offsetWidth
        const bh = balloon.offsetHeight
        const halfW = bw / 2
        const left = Math.min(
          Math.max(r.left + r.width / 2, margin + halfW),
          vw - margin - halfW,
        )
        let { top, place, maxHeight } = locked
        if (place === 'above') {
          maxHeight = Math.max(140, Math.min(top - margin, vh - margin * 2))
          if (top - Math.min(bh, maxHeight) < margin) {
            place = 'below'
            top = Math.min(r.bottom + 8, vh - margin - 140)
            maxHeight = Math.max(140, vh - top - margin)
          }
        } else {
          maxHeight = Math.max(
            140,
            Math.min(vh - top - margin, vh - margin * 2),
          )
          if (top + Math.min(bh, maxHeight) > vh - margin) {
            top = Math.max(margin, vh - margin - Math.min(bh, maxHeight))
            maxHeight = Math.max(140, vh - top - margin)
          }
        }
        locked = { left, top, place, maxHeight }
        setPos(locked)
        return
      }
      update(false)
    })

    const stage = anchorRef.current?.closest('.casc__stage--pan')
    const onScroll = () => update(true)
    const onResize = () => {
      locked = null
      update(false)
    }
    if (!isMobile) {
      stage?.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('scroll', onScroll, true)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(raf)
      stage?.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchorRef, equipment.id, isMobile])

  if (!pos || typeof document === 'undefined') return null

  const p = fmt(primary?.pKWe, 'kWe')
  const q = fmt(primary?.qKVAr, 'kVAr')
  const s = fmt(primary?.sKVA, 'kVA')
  const ib = fmt(primary?.ibA, 'A')
  const pn = fmt(primary?.pnKW, 'kW')
  const inA =
    primary?.protectionCurrentA != null
      ? `${primary.protectionCurrentA} A`
      : null
  const secondary = labelSecondaryDenom(equipment)

  return createPortal(
    <div
      ref={balloonRef}
      className={`equip-balloon equip-balloon--portal equip-balloon--${pos.place}${showClose ? ' equip-balloon--closable' : ''}`}
      style={{
        left: pos.left,
        top: pos.top,
        maxHeight: pos.maxHeight,
      }}
      role="dialog"
      aria-label={`Equipo ${equipment.id}`}
      aria-modal={showClose || undefined}
    >
      <header className="equip-balloon__header">
        <div className="equip-balloon__header-text">
          <span className="equip-balloon__kicker">Equipo</span>
          <strong className="equip-balloon__title">{equipment.id}</strong>
          {secondary && (
            <span className="equip-balloon__dcp">{secondary.value}</span>
          )}
        </div>
        {showClose && (
          <button
            type="button"
            className="equip-balloon__close"
            aria-label="Cerrar información"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClose?.()
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        )}
      </header>
      <dl className="equip-balloon__kv">
        <dt>PUMA</dt>
        <dd>{equipment.id}</dd>
        {secondary && (
          <>
            <dt>{secondary.kind === 'nme674' ? 'NME-674' : 'DCP-10'}</dt>
            <dd className="equip-balloon__dcp-dd">{secondary.value}</dd>
          </>
        )}
        <dt>Nombre</dt>
        <dd>{equipment.name}</dd>
        <dt>Tipo</dt>
        <dd>{KIND_LABEL[equipment.kind] ?? equipment.kind}</dd>
        <dt>Local</dt>
        <dd>
          {equipment.local?.trim() ? (
            <>
              {equipment.local}
              {equipment.localName?.trim() ? (
                <span className="equip-balloon__local-name">
                  {' '}
                  · {equipment.localName}
                </span>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </dd>
        {equipment.voltage && (
          <>
            <dt>Tensión</dt>
            <dd>{equipment.voltage}</dd>
          </>
        )}
        {primary?.protectionName && (
          <>
            <dt>Protección</dt>
            <dd>{primary.protectionName}</dd>
          </>
        )}
        {primary?.protectionModel && (
          <>
            <dt>Modelo</dt>
            <dd>{primary.protectionModel}</dd>
          </>
        )}
        {inA && (
          <>
            <dt>In</dt>
            <dd>{inA}</dd>
          </>
        )}
        {ib && (
          <>
            <dt>Ib</dt>
            <dd>{ib}</dd>
          </>
        )}
        {p && (
          <>
            <dt>P</dt>
            <dd>{p}</dd>
          </>
        )}
        {q && (
          <>
            <dt>Q</dt>
            <dd>{q}</dd>
          </>
        )}
        {s && (
          <>
            <dt>S</dt>
            <dd>{s}</dd>
          </>
        )}
        {pn && (
          <>
            <dt>Pn</dt>
            <dd>{pn}</dd>
          </>
        )}
        {primary?.service && (
          <>
            <dt>Servicio</dt>
            <dd>
              <span className={`badge badge--svc-${primary.service}`}>
                {primary.service}
              </span>
            </dd>
          </>
        )}
        {primary?.circuitRef && (
          <>
            <dt>Ref. circuito</dt>
            <dd>{primary.circuitRef}</dd>
          </>
        )}
        {(primary?.parallelCables != null || primary?.cableSection) && (
          <>
            <dt>Cable</dt>
            <dd>
              {primary.parallelCables != null ? `${primary.parallelCables}×` : ''}
              {primary.cableSection ?? '—'}
              {primary.cableSection &&
              !String(primary.cableSection).includes('mm')
                ? ' mm²'
                : ''}
            </dd>
          </>
        )}
        {equipment.description && (
          <>
            <dt>Descripción</dt>
            <dd>{equipment.description}</dd>
          </>
        )}
        {equipment.virtual && (
          <>
            <dt>Nota</dt>
            <dd>Nodo de barra (sintético)</dd>
          </>
        )}
        {equipment.spare && (
          <>
            <dt>Nota</dt>
            <dd>Interruptor de reserva (RESPETO · Excel col. L)</dd>
          </>
        )}
        {feeds && feeds.length > 0 && (
          <>
            <dt>Alimentaciones</dt>
            <dd>
              <ul className="equip-balloon__feeds">
                {feeds.map((f) => (
                  <li key={`${f.originId}-${f.name}`}>
                    <span
                      className={`badge badge--${f.lineType === 'alternativa' ? 'alternativa' : 'normal'}`}
                    >
                      {f.lineType === 'alternativa' ? 'ALT' : 'NORM'}
                    </span>{' '}
                    {f.name}
                    <span className="equip-balloon__from">
                      {' '}
                      ← {originLabel(f.originId)}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </div>,
    document.body,
  )
}
