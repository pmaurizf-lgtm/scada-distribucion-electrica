import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { Circuit, ProtectionState } from '../types'
import { isMotorizedProtectionModel } from '../abtDownstream/ssbBoard'
import {
  LockBadge,
  ManualBreakerSymbol,
  MotorizedBreakerSymbol,
} from './BreakerSymbols'

/** Interruptor unifilar (motorizado MSB o manual INS/NG125/iC60). */
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
  motorized,
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
  /** Forzar motorizado / manual; por defecto se deduce del modelo Excel. */
  motorized?: boolean
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
}) {
  const open = state !== 'cerrada'
  const hoverTimer = useRef<number | null>(null)
  const isMotor =
    motorized ??
    isMotorizedProtectionModel(circuit?.protectionModel, name)

  const clearHoverTimer = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  useEffect(() => () => clearHoverTimer(), [])

  const kindLabel = isMotor ? 'motorizado' : 'no motorizado'
  const aria = `Interruptor ${kindLabel} ${name} · ${open ? 'abierto' : 'cerrado'}${locked ? ' · bloqueado' : ''}`
  // Con globo de info: sin title nativo (tapaba el globo). Sin globo: title corto.
  const nativeTitle = onHoverInfo
    ? undefined
    : (title ?? aria)

  return (
    <button
      type="button"
      className={`casc-brk${state ? ` casc-brk--${state}` : ''}${compact ? ' casc-brk--compact' : ''}${flowing ? ' casc-brk--flow' : ''}${locked ? ' casc-brk--locked' : ''}${orientation === 'horizontal' ? ' casc-brk--horizontal' : ''}${isMotor ? '' : ' casc-brk--manual'}`}
      onClick={onClick}
      title={nativeTitle}
      aria-label={aria}
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
        {isMotor ? (
          <MotorizedBreakerSymbol state={state} orientation={orientation} />
        ) : (
          <ManualBreakerSymbol state={state} orientation={orientation} />
        )}
      </span>
      {locked && <LockBadge />}
      <span className="casc-brk__name">{name}</span>
    </button>
  )
}
