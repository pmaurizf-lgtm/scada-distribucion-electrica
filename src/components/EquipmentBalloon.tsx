import type { Equipment } from '../types'

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
}

export function EquipmentBalloon({ equipment, feeds }: EquipmentBalloonProps) {
  return (
    <div
      className="equip-balloon"
      role="tooltip"
      aria-label={`Equipo ${equipment.id}`}
    >
      <header className="equip-balloon__header">
        <span className="equip-balloon__kicker">Equipo</span>
        <strong className="equip-balloon__title">{equipment.id}</strong>
      </header>
      <dl className="equip-balloon__kv">
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
                    <span className="equip-balloon__from"> ← {f.originId}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
