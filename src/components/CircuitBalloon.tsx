import {
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { Circuit, ProtectionState } from '../types'
import { dcp10Of } from '../data/system690'

interface CircuitBalloonProps {
  circuit: Circuit
  state?: ProtectionState
  x: number
  y: number
  onClose: () => void
  /** Si true, se ancla en viewport (portal) — planta y árbol */
  fixed?: boolean
}

function fmt(n: number | null | undefined, unit: string, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)} ${unit}`
}

function DenomPair({ pumaId }: { pumaId: string }) {
  const dcp = dcp10Of(pumaId)
  return (
    <span className="circuit-balloon__denoms">
      <span>
        <span className="circuit-balloon__denom-lbl">PUMA</span>{' '}
        <span className="circuit-balloon__puma">{pumaId}</span>
      </span>
      {dcp && (
        <span>
          <span className="circuit-balloon__denom-lbl">DCP-10</span>{' '}
          <span className="circuit-balloon__dcp">{dcp}</span>
        </span>
      )}
    </span>
  )
}

const VIEW_PAD = 10

/** Coloca el globo en viewport sin salir por bordes (ni statusbar). */
export function placeCircuitBalloon(
  anchor: DOMRect,
  size = { w: 280, h: 420 },
): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let x = anchor.right + 10
  if (x + size.w > vw - VIEW_PAD) {
    x = Math.max(VIEW_PAD, anchor.left - size.w - 10)
  }
  let y = anchor.top
  if (y + size.h > vh - VIEW_PAD) {
    y = Math.max(VIEW_PAD, vh - size.h - VIEW_PAD)
  }
  // Si el ancla está abajo, preferir abrir hacia arriba del chip
  if (anchor.bottom > vh * 0.55 && anchor.top > size.h + VIEW_PAD) {
    y = Math.max(VIEW_PAD, anchor.top - size.h)
  }
  return { x, y }
}

export function CircuitBalloon({
  circuit,
  state,
  x,
  y,
  onClose,
  fixed = false,
}: CircuitBalloonProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    setPos({ x, y })
  }, [x, y, circuit.id])

  useLayoutEffect(() => {
    if (!fixed) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = pos.x
    let ny = pos.y
    if (r.right > vw - VIEW_PAD) nx = Math.max(VIEW_PAD, vw - r.width - VIEW_PAD)
    if (r.left < VIEW_PAD) nx = VIEW_PAD
    if (r.bottom > vh - VIEW_PAD) ny = Math.max(VIEW_PAD, vh - r.height - VIEW_PAD)
    if (r.top < VIEW_PAD) ny = VIEW_PAD
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
  }, [fixed, pos.x, pos.y, circuit.id])

  const node = (
    <div
      ref={ref}
      className={`circuit-balloon${fixed ? ' circuit-balloon--fixed' : ''}`}
      style={{ left: pos.x, top: pos.y }}
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
        {circuit.voltage && (
          <>
            <dt>Tensión</dt>
            <dd>{circuit.voltage}</dd>
          </>
        )}
        {circuit.circuitRef && (
          <>
            <dt>Ref. circuito</dt>
            <dd>{circuit.circuitRef}</dd>
          </>
        )}
        {(circuit.parallelCables != null || circuit.cableSection) && (
          <>
            <dt>Cable</dt>
            <dd>
              {circuit.parallelCables != null ? `${circuit.parallelCables}×` : ''}
              {circuit.cableSection ?? '—'}
              {circuit.cableSection && !String(circuit.cableSection).includes('mm')
                ? ' mm²'
                : ''}
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
        <dd>
          <DenomPair pumaId={circuit.originId} />
        </dd>
        <dt>Destino</dt>
        <dd>
          <DenomPair pumaId={circuit.destinationId} />
        </dd>
        {circuit.notes && (
          <>
            <dt>Notas</dt>
            <dd>{circuit.notes}</dd>
          </>
        )}
        {circuit.spare && (
          <>
            <dt>Nota</dt>
            <dd>Interruptor de reserva (RESPETO · Excel col. L)</dd>
          </>
        )}
      </dl>
    </div>
  )

  if (fixed && typeof document !== 'undefined') {
    return createPortal(node, document.body)
  }
  return node
}
