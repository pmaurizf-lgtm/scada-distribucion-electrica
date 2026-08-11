import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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
}

export function EquipmentBalloon({
  equipment,
  feeds,
  circuits,
  anchorRef,
}: EquipmentBalloonProps) {
  const [pos, setPos] = useState<{
    left: number
    top: number
    place: 'above' | 'below'
  } | null>(null)
  const primary = circuits?.[0]

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const margin = 12
      const halfW = 140
      const preferAboveH = 200
      let place: 'above' | 'below' = 'above'
      let top = r.top - 10
      if (r.top < preferAboveH + margin) {
        place = 'below'
        top = r.bottom + 10
      }
      const left = Math.min(
        Math.max(r.left + r.width / 2, margin + halfW),
        window.innerWidth - margin - halfW,
      )
      setPos({ left, top, place })
    }

    update()
    const stage = anchorRef.current?.closest('.casc__stage--pan')
    stage?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      stage?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef, equipment.id])

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
      className={`equip-balloon equip-balloon--portal equip-balloon--${pos.place}`}
      style={{ left: pos.left, top: pos.top }}
      role="tooltip"
      aria-label={`Equipo ${equipment.id}`}
    >
      <header className="equip-balloon__header">
        <span className="equip-balloon__kicker">Equipo</span>
        <strong className="equip-balloon__title">{equipment.id}</strong>
        {secondary && (
          <span className="equip-balloon__dcp">{secondary.value}</span>
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
