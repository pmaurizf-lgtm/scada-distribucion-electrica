import {
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { CircuitLockInfo } from '../utils/parseLocksExcel'

type Props = {
  info: CircuitLockInfo
  protectionName?: string
  x: number
  y: number
  onClose: () => void
}

const VIEW_PAD = 10

export function placeLockBalloon(
  anchor: DOMRect,
  size = { w: 260, h: 220 },
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
  return { x, y }
}

/** Globo al pulsar el candado: nº LOTO y datos de consignación. */
export function LockBalloon({
  info,
  protectionName,
  x,
  y,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    setPos({ x, y })
  }, [x, y, info.lockNumber, info.interruptor])

  useLayoutEffect(() => {
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
  }, [pos.x, pos.y, info.lockNumber])

  const node = (
    <div
      ref={ref}
      className="lock-balloon circuit-balloon circuit-balloon--fixed"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={`Candado ${info.lockNumber}`}
    >
      <header className="circuit-balloon__header">
        <div>
          <span className="circuit-balloon__kicker">Candado LOTO</span>
          <strong className="circuit-balloon__title">Nº {info.lockNumber}</strong>
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
        <dt>Interruptor</dt>
        <dd>{info.interruptor}</dd>
        {protectionName && (
          <>
            <dt>Protección</dt>
            <dd>{protectionName}</dd>
          </>
        )}
        {info.comment && (
          <>
            <dt>Polo / nota</dt>
            <dd>{info.comment}</dd>
          </>
        )}
        {info.siteEquipment && (
          <>
            <dt>Equipo</dt>
            <dd>{info.siteEquipment}</dd>
          </>
        )}
        {info.local && (
          <>
            <dt>Local</dt>
            <dd>{info.local}</dd>
          </>
        )}
      </dl>
    </div>
  )

  return createPortal(node, document.body)
}
