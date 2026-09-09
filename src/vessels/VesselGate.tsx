import { VESSELS, type VesselId } from './vesselCatalog'

type VesselGateProps = {
  onSelect: (id: VesselId) => void
}

/** Pantalla obligatoria al abrir la app: elegir escritorio de buque. */
export function VesselGate({ onSelect }: VesselGateProps) {
  return (
    <div className="vessel-gate" role="dialog" aria-labelledby="vessel-gate-title">
      <div className="vessel-gate__card">
        <p className="vessel-gate__eyebrow">Distribution Power System</p>
        <h1 id="vessel-gate-title" className="vessel-gate__title">
          Elegir buque
        </h1>
        <p className="vessel-gate__hint">
          Cada escritorio tiene sus propios candados LOTO y notas de revisión. El
          unifilar es común.
        </p>
        <ul className="vessel-gate__list">
          {VESSELS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className="vessel-gate__btn"
                onClick={() => onSelect(v.id)}
              >
                <span className="vessel-gate__id">{v.id}</span>
                <span className="vessel-gate__name">{v.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
