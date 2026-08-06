import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Equipment } from '../types'
import { originLabel } from '../utils/cascadeModel'

const KIND_LABEL: Record<Equipment['kind'], string> = {
  generador: 'Generador',
  conversion: 'Conversión',
  cuadro_principal: 'Cuadro principal',
  cuadro_secundario: 'Cuadro secundario',
  consumidor: 'Consumidor',
}

interface EquipmentBalloonProps {
  equipment: Equipment
  feeds?: { name: string; lineType: string; originId: string }[]
  /** Ancla del hover (botón/caja del equipo) */
  anchorRef: RefObject<HTMLElement | null>
}

export function EquipmentBalloon({
  equipment,
  feeds,
  anchorRef,
}: EquipmentBalloonProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({
        left: r.left + r.width / 2,
        top: r.top - 10,
      })
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

  return createPortal(
    <div
      className="equip-balloon equip-balloon--portal"
      style={{ left: pos.left, top: pos.top }}
      role="tooltip"
      aria-label={`Equipo ${equipment.id}`}
    >
      <header className="equip-balloon__header">
        <span className="equip-balloon__kicker">Equipo</span>
        <strong className="equip-balloon__title">{equipment.id}</strong>
        {equipment.dcp10Id && (
          <span className="equip-balloon__dcp">{equipment.dcp10Id}</span>
        )}
      </header>
      <dl className="equip-balloon__kv">
        <dt>PUMA</dt>
        <dd>{equipment.id}</dd>
        {equipment.dcp10Id && (
          <>
            <dt>DCP-10</dt>
            <dd className="equip-balloon__dcp-dd">{equipment.dcp10Id}</dd>
          </>
        )}
        <dt>Nombre</dt>
        <dd>{equipment.name}</dd>
        <dt>Tipo</dt>
        <dd>{KIND_LABEL[equipment.kind] ?? equipment.kind}</dd>
        {equipment.local && (
          <>
            <dt>Local</dt>
            <dd>{equipment.local}</dd>
          </>
        )}
        {equipment.voltage && (
          <>
            <dt>Tensión</dt>
            <dd>{equipment.voltage}</dd>
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
