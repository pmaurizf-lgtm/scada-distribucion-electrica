import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { Circuit, ProtectionState } from '../types'
import { LockBadge, MotorizedBreakerSymbol } from './BreakerSymbols'

/** Interruptor motorizado (mismo aspecto en MSB y aguas abajo). */
export function BreakerChip({
  name,
  state,
  onClick,
  compact,
  circuitId,
  circuit,
  flowing,
  locked,
  title,
  orientation = 'vertical',
  onHoverInfo,
  onHoverInfoEnd,
}: {
  name: string
  state?: ProtectionState
  onClick?: (e: ReactMouseEvent) => void
  compact?: boolean
  circuitId?: string
  /** Si se pasa, el globo de info aparece tras ~1,8 s de hover (no al pulsar) */
  circuit?: Circuit
  flowing?: boolean
  locked?: boolean
  title?: string
  orientation?: 'vertical' | 'horizontal'
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const open = state !== 'cerrada'
  const hoverTimer = useRef<number | null>(null)

  const clearHoverTimer = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  useEffect(() => () => clearHoverTimer(), [])

  return (
    <button
      type="button"
      className={`casc-brk${state ? ` casc-brk--${state}` : ''}${compact ? ' casc-brk--compact' : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}${orientation === 'horizontal' ? ' casc-brk--horizontal' : ''}`}
      onClick={onClick}
      title={
        title ??
        `Interruptor motorizado ${name} · ${open ? 'abierto' : 'cerrado'}${locked ? ' · BLOQUEADO' : ''} · mantén el puntero para ver detalles`
      }
      data-circuit-id={circuitId}
      onMouseEnter={(e) => {
        if (!circuit || !onHoverInfo) return
        clearHoverTimer()
        const el = e.currentTarget
        hoverTimer.current = window.setTimeout(() => {
          onHoverInfo(circuit, el.getBoundingClientRect())
        }, 1800)
      }}
      onMouseLeave={() => {
        clearHoverTimer()
        onHoverInfoEnd?.()
      }}
    >
      <span className="casc-brk__sym">
        <MotorizedBreakerSymbol state={state} orientation={orientation} />
      </span>
      {locked && <LockBadge />}
      <span className="casc-brk__name">{name}</span>
    </button>
  )
}
