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
          Busca un equipo por nombre o ID. La búsqueda resalta el equipo y todas
          las alimentaciones aguas arriba (datos reales 690 V).
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
          <CloseButton onClose={onClose} />
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
          <CloseButton onClose={onClose} />
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
        <CloseButton onClose={onClose} />
      </header>
      <CircuitDetails
        circuit={selection.item}
        state={protectionStatus[selection.item.id]}
      />
    </aside>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="panel__close" onClick={onClose} aria-label="Cerrar">
      ×
    </button>
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
      <EquipmentKv equipment={equipment} />
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
      <EquipmentKv equipment={equipment} />
      <h3>Circuitos entrantes ({incoming.length})</h3>
      <CircuitList circuits={incoming} protectionStatus={protectionStatus} />
      <h3>Circuitos salientes ({outgoing.length})</h3>
      <CircuitList circuits={outgoing} protectionStatus={protectionStatus} />
    </div>
  )
}

function EquipmentKv({ equipment }: { equipment: Equipment }) {
  return (
    <dl className="kv">
      <dt>ID</dt>
      <dd>{equipment.id}</dd>
      <dt>Nombre</dt>
      <dd>{equipment.name}</dd>
      <dt>Tipo</dt>
      <dd>{equipment.kind.replaceAll('_', ' ')}</dd>
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
      {equipment.virtual && (
        <>
          <dt>Nota</dt>
          <dd>Nodo de barra (sintético)</dd>
        </>
      )}
    </dl>
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
        {circuit.circuitRef && (
          <>
            <dt>Ref. Excel</dt>
            <dd>{circuit.circuitRef}</dd>
          </>
        )}
        {circuit.excelRow && (
          <>
            <dt>Fila Excel</dt>
            <dd>{circuit.excelRow}</dd>
          </>
        )}
        <dt>Nombre</dt>
        <dd>{circuit.name}</dd>
        <dt>Origen</dt>
        <dd>{circuit.originId}</dd>
        <dt>Destino</dt>
        <dd>{circuit.destinationId}</dd>
        <dt>Breaker ID</dt>
        <dd>{circuit.protectionName}</dd>
        {circuit.protectionModel && (
          <>
            <dt>Modelo</dt>
            <dd>{circuit.protectionModel}</dd>
          </>
        )}
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
        <dt>In</dt>
        <dd>
          {circuit.protectionCurrentA != null
            ? `${circuit.protectionCurrentA} A`
            : '—'}
        </dd>
        <dt>Tipo línea</dt>
        <dd>
          <span className={`badge badge--${circuit.lineType}`}>
            {circuit.lineType === 'normal' ? 'Normal' : 'Alternativa'}
          </span>
        </dd>
        {circuit.service && (
          <>
            <dt>Servicio</dt>
            <dd>
              <span className={`badge badge--svc-${circuit.service}`}>
                {circuit.service}
              </span>
            </dd>
          </>
        )}
        {circuit.pKWe != null && (
          <>
            <dt>P</dt>
            <dd>{circuit.pKWe.toFixed(2)} kWe</dd>
          </>
        )}
        {circuit.qKVAr != null && (
          <>
            <dt>Q</dt>
            <dd>{circuit.qKVAr.toFixed(2)} kVAr</dd>
          </>
        )}
        {circuit.sKVA != null && (
          <>
            <dt>S</dt>
            <dd>{circuit.sKVA.toFixed(2)} kVA</dd>
          </>
        )}
        {circuit.ibA != null && (
          <>
            <dt>Ib</dt>
            <dd>{circuit.ibA.toFixed(2)} A</dd>
          </>
        )}
        {circuit.voltage && (
          <>
            <dt>Tensión</dt>
            <dd>{circuit.voltage}</dd>
          </>
        )}
        {circuit.parallelCables != null && circuit.parallelCables > 1 && (
          <>
            <dt>Paralelos</dt>
            <dd>{circuit.parallelCables}</dd>
          </>
        )}
        {circuit.virtual && (
          <>
            <dt>Nota</dt>
            <dd>Enlace de barra (sintético)</dd>
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
                {c.protectionName}
                {c.protectionCurrentA != null
                  ? ` · ${c.protectionCurrentA} A`
                  : ''}
                {c.service ? ` · ${c.service}` : ''}
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
