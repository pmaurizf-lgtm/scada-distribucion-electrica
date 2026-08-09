import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Circuit, ProtectionState } from '../types'
import { BreakerChip } from './BreakerChip'
import { aux24JumpRevealId } from '../utils/cascadeModel'

/**
 * AUX 24 V como pierna superior estilo alimentación remota (a la izquierda de ALT/NORM):
 * extremo libre → chip → mid + cartel «AUX 24 V» → bajante al equipo.
 * Clic en el interruptor → ir al receptor (destino).
 */
export function Aux24Incoming({
  circuit,
  protectionStatus,
  energizedCircuitIds,
  lockedCircuits,
  onJumpToCircuit,
  onHoverInfo,
  onHoverInfoEnd,
}: {
  circuit: Circuit
  protectionStatus: Record<string, ProtectionState>
  energizedCircuitIds: Set<string>
  lockedCircuits: Set<string>
  onLocalBreaker?: (c: Circuit, e: ReactMouseEvent) => void
  onJumpToCircuit?: (c: Circuit) => void
  onHoverInfo?: (circuit: Circuit, rect: DOMRect) => void
  onHoverInfoEnd?: () => void
  /** @deprecated Ignorado; AUX va siempre en `.hbus-drop__tops`. */
  variant?: 'side' | 'msb'
}) {
  const flowing = energizedCircuitIds.has(circuit.id)
  const receptorId = aux24JumpRevealId(circuit)
  return (
    <div
      className={`hbus-drop__leg hbus-drop__leg--remote hbus-drop__leg--aux${flowing ? ' hbus-drop__leg--flow' : ''}`}
      data-circuit-id={circuit.id}
      title={`AUX 24 V → receptor ${receptorId} (desde ${circuit.originId}). Pulsa el interruptor para ir al receptor.`}
    >
      <span className="hbus-drop__free-end" aria-hidden />
      <BreakerChip
        name={circuit.protectionName}
        state={protectionStatus[circuit.id]}
        compact
        circuitId={circuit.id}
        circuit={circuit}
        flowing={flowing}
        locked={lockedCircuits.has(circuit.id)}
        title={`Ir al receptor ${receptorId} (AUX 24 V · ${circuit.protectionName})`}
        onHoverInfo={onHoverInfo}
        onHoverInfoEnd={onHoverInfoEnd}
        onClick={(e) => {
          e.stopPropagation()
          onJumpToCircuit?.(circuit)
        }}
      />
      <span className="hbus-drop__wire hbus-drop__wire--mid" aria-hidden />
      <span className="hbus-drop__tag hbus-drop__tag--aux">AUX 24 V</span>
      <span
        className={`hbus-drop__wire hbus-drop__wire--to-eq${flowing ? ' hbus-drop__wire--flow' : ''}`}
        aria-hidden
      />
    </div>
  )
}
