import type { Circuit, ProtectionState } from '../types'

interface CircuitBalloonProps {
  circuit: Circuit
  state?: ProtectionState
  x: number
  y: number
  onClose: () => void
}

function fmt(n: number | null | undefined, unit: string, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)} ${unit}`
}

export function CircuitBalloon({
  circuit,
  state,
  x,
  y,
  onClose,
}: CircuitBalloonProps) {
  return (
    <div
      className="circuit-balloon"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={`Protección ${circuit.protectionName}`}
    >
      <header className="circuit-balloon__header">
        <div>
          <span className="circuit-balloon__kicker">Protección</span>
          <strong className="circuit-balloon__title">
            {circuit.protectionName}
          </strong>
        </div>
        <button
          type="button"
          className="circuit-balloon__close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>
      </header>

      <dl className="circuit-balloon__kv">
        {circuit.protectionModel && (
          <>
            <dt>Modelo</dt>
            <dd>{circuit.protectionModel}</dd>
          </>
        )}
        <dt>In</dt>
        <dd>
          {circuit.protectionCurrentA != null
            ? `${circuit.protectionCurrentA} A`
            : '—'}
        </dd>
        <dt>Ib</dt>
        <dd>{fmt(circuit.ibA, 'A')}</dd>
        <dt>P</dt>
        <dd>{fmt(circuit.pKWe, 'kWe')}</dd>
        <dt>Q</dt>
        <dd>{fmt(circuit.qKVAr, 'kVAr')}</dd>
        <dt>S</dt>
        <dd>{fmt(circuit.sKVA, 'kVA')}</dd>
        <dt>Línea</dt>
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
        {state && (
          <>
            <dt>Estado</dt>
            <dd>
              <span className={`badge badge--${state}`}>
                {state === 'cerrada' ? 'Cerrada' : 'Abierta'}
              </span>
            </dd>
          </>
        )}
        <dt>Origen</dt>
        <dd>{circuit.originId}</dd>
        <dt>Destino</dt>
        <dd>{circuit.destinationId}</dd>
        {circuit.spare && (
          <>
            <dt>Nota</dt>
            <dd>Interruptor de reserva (RESPETO · Excel col. L)</dd>
          </>
        )}
      </dl>
    </div>
  )
}
