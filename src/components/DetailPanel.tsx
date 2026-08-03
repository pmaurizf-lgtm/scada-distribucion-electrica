import type { Circuit, Equipment, ProtectionState, Selection } from '../types'

interface DetailPanelProps {
  selection: Selection
  protectionStatus: Record<string, ProtectionState>
  onClose: () => void
}

export function DetailPanel({
  selection,
  protectionStatus,
  onClose,
}: DetailPanelProps) {
  if (!selection) {
    return (
      <aside className="panel panel--empty">
        <h2>Detalle</h2>
        <p>
          Busca un equipo por nombre o selecciónalo en el diagrama. La búsqueda
          resalta el equipo y todas las alimentaciones aguas arriba.
        </p>
        <p className="muted" style={{ marginTop: '1rem' }}>
          Protecciones: <span className="swatch swatch--cerrada" /> cerrada
          (rojo) · <span className="swatch swatch--abierta" /> abierta (verde)
        </p>
      </aside>
    )
  }

  if (selection.type === 'search') {
    return (
      <aside className="panel">
        <header className="panel__header">
          <h2>Búsqueda · aguas arriba</h2>
          <button
            type="button"
            className="panel__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <SearchDetails
          equipment={selection.item}
          upstreamCircuits={selection.upstreamCircuits}
          protectionStatus={protectionStatus}
        />
      </aside>
    )
  }

  if (selection.type === 'equipment') {
    return (
      <aside className="panel">
        <header className="panel__header">
          <h2>Equipo</h2>
          <button
            type="button"
            className="panel__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <EquipmentDetails
          equipment={selection.item}
          circuits={selection.circuits}
          protectionStatus={protectionStatus}
        />
      </aside>
    )
  }

  return (
    <aside className="panel">
      <header className="panel__header">
        <h2>Circuito</h2>
        <button
          type="button"
          className="panel__close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>
      </header>
      <CircuitDetails
        circuit={selection.item}
        state={protectionStatus[selection.item.id]}
      />
    </aside>
  )
}

function SearchDetails({
  equipment,
  upstreamCircuits,
  protectionStatus,
}: {
  equipment: Equipment
  upstreamCircuits: Circuit[]
  protectionStatus: Record<string, ProtectionState>
}) {
  return (
    <div className="panel__body">
      <p className="search-hit">
        Equipo localizado: <strong>{equipment.name}</strong>
        <span className="muted"> ({equipment.id})</span>
      </p>
      <dl className="kv">
        <dt>Tipo</dt>
        <dd>{equipment.kind.replaceAll('_', ' ')}</dd>
        {equipment.voltage && (
          <>
            <dt>Tensión</dt>
            <dd>{equipment.voltage}</dd>
          </>
        )}
      </dl>

      <h3>Alimentaciones aguas arriba ({upstreamCircuits.length})</h3>
      <CircuitList
        circuits={upstreamCircuits}
        protectionStatus={protectionStatus}
        showPath
      />
    </div>
  )
}

function EquipmentDetails({
  equipment,
  circuits,
  protectionStatus,
}: {
  equipment: Equipment
  circuits: Circuit[]
  protectionStatus: Record<string, ProtectionState>
}) {
  const incoming = circuits.filter((c) => c.destinationId === equipment.id)
  const outgoing = circuits.filter((c) => c.originId === equipment.id)

  return (
    <div className="panel__body">
      <dl className="kv">
        <dt>ID</dt>
        <dd>{equipment.id}</dd>
        <dt>Nombre</dt>
        <dd>{equipment.name}</dd>
        <dt>Tipo</dt>
        <dd>{equipment.kind.replaceAll('_', ' ')}</dd>
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
      </dl>

      <h3>Circuitos entrantes ({incoming.length})</h3>
      <CircuitList circuits={incoming} protectionStatus={protectionStatus} />
      <h3>Circuitos salientes ({outgoing.length})</h3>
      <CircuitList circuits={outgoing} protectionStatus={protectionStatus} />
    </div>
  )
}

function CircuitDetails({
  circuit,
  state,
}: {
  circuit: Circuit
  state?: ProtectionState
}) {
  return (
    <div className="panel__body">
      <dl className="kv">
        <dt>ID</dt>
        <dd>{circuit.id}</dd>
        <dt>Nombre</dt>
        <dd>{circuit.name}</dd>
        <dt>Origen</dt>
        <dd>{circuit.originId}</dd>
        <dt>Destino</dt>
        <dd>{circuit.destinationId}</dd>
        <dt>Protección</dt>
        <dd>{circuit.protectionName}</dd>
        <dt>Estado</dt>
        <dd>
          {state ? (
            <span className={`badge badge--${state}`}>
              {state === 'cerrada' ? 'Cerrada' : 'Abierta'}
            </span>
          ) : (
            <span className="muted">Sin estado cargado</span>
          )}
        </dd>
        <dt>Intensidad</dt>
        <dd>{circuit.protectionCurrentA} A</dd>
        <dt>Tipo de línea</dt>
        <dd>
          <span className={`badge badge--${circuit.lineType}`}>
            {circuit.lineType === 'normal' ? 'Normal' : 'Alternativa'}
          </span>
        </dd>
        {circuit.voltage && (
          <>
            <dt>Tensión</dt>
            <dd>{circuit.voltage}</dd>
          </>
        )}
        {circuit.cableSection && (
          <>
            <dt>Sección cable</dt>
            <dd>{circuit.cableSection}</dd>
          </>
        )}
        {circuit.notes && (
          <>
            <dt>Notas</dt>
            <dd>{circuit.notes}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

function CircuitList({
  circuits,
  protectionStatus,
  showPath = false,
}: {
  circuits: Circuit[]
  protectionStatus: Record<string, ProtectionState>
  showPath?: boolean
}) {
  if (circuits.length === 0) {
    return <p className="muted">Ninguno</p>
  }
  return (
    <ul className="circuit-list">
      {circuits.map((c) => {
        const state = protectionStatus[c.id]
        return (
          <li key={c.id}>
            <span
              className={`dot ${state ? `dot--prot-${state}` : `dot--${c.lineType}`}`}
            />
            <span>
              <strong>{c.name}</strong>
              <br />
              <span className="muted">
                {showPath && `${c.originId} → ${c.destinationId} · `}
                {c.protectionName} · {c.protectionCurrentA} A
                {state && (
                  <>
                    {' '}
                    ·{' '}
                    <span className={`badge badge--${state}`}>
                      {state === 'cerrada' ? 'cerrada' : 'abierta'}
                    </span>
                  </>
                )}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
