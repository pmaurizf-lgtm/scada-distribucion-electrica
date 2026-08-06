import { useMemo } from 'react'
import { system690 } from '../data/system690'
import {
  trfWindingLegs,
  type TrfWindingLeg,
} from '../abtDownstream'

/**
 * Detalle del banco TRF (independiente del LCS).
 * 440 V baja al hijo LCS vía QVS; 230 V queda aparcado.
 */

function PhaseUnit({
  phase,
  leg440,
  live,
}: {
  phase: string
  leg440?: TrfWindingLeg
  live: boolean
}) {
  return (
    <div className={`trf-phase${live ? ' trf-phase--live' : ''}`}>
      <div className="trf-phase__pri">690 V</div>
      <div className="trf-phase__sym" title={`Banco monofásico (${phase})`}>
        <span className="trf-phase__coil">≈</span>
        <span className="trf-phase__coil">≈</span>
        <span className="trf-phase__coil trf-phase__coil--tert">≈</span>
      </div>
      <div className="trf-phase__ph">({phase})</div>
      <div className="trf-phase__sec">
        <span>440</span>
        <span className="trf-phase__tert-lbl">230</span>
      </div>
      <div className="trf-phase__out440" aria-hidden />
      {leg440 && (
        <span className="trf-phase__ref" title={leg440.circuitRef}>
          …-{leg440.circuitRef.split('-').pop()}
        </span>
      )}
    </div>
  )
}

/** Solo el recuadro interno del banco (el TRF sigue siendo el equipo padre). */
export function TrfBankPanel({
  trfId,
  energizedEquipmentIds,
}: {
  trfId: string
  energizedEquipmentIds: Set<string>
}) {
  const trf = useMemo(
    () => system690.equipment.find((e) => e.id === trfId),
    [trfId],
  )
  const legs440 = useMemo(() => trfWindingLegs(trfId, '440'), [trfId])
  const legs230 = useMemo(() => trfWindingLegs(trfId, '230'), [trfId])
  const live = energizedEquipmentIds.has(trfId)
  const byPhase = (p: string) => legs440.find((l) => l.phase === p)

  if (!trf) return null

  return (
    <div className="trf-bank-panel">
      <aside className="trf-lcs__park230" title="230 V aparcado hasta cerrar 440 V">
        <div className="trf-lcs__park230-title">230 V</div>
        <div className="trf-lcs__park230-lines">
          {legs230.map((leg) => (
            <div key={leg.circuitRef} className="trf-lcs__park230-leg">
              <span className="trf-lcs__park230-wire" aria-hidden />
              <span>{leg.phase}</span>
            </div>
          ))}
        </div>
        <div className="trf-lcs__park230-note">Hacia QVS-230 · pendiente</div>
      </aside>

      <div className={`trf-bank${live ? ' trf-bank--live' : ''}`}>
        <div className="trf-bank__title">BANCO MONOFÁSICO · 690 / 440-230 V</div>
        <div className="trf-bank__units">
          <PhaseUnit phase="AB" leg440={byPhase('AB')} live={live} />
          <PhaseUnit phase="BC" leg440={byPhase('BC')} live={live} />
          <PhaseUnit phase="CA" leg440={byPhase('CA')} live={live} />
        </div>
        <div className={`trf-bank__down440${live ? ' trf-bank__down440--live' : ''}`}>
          {(['AB', 'BC', 'CA'] as const).map((ph) => (
            <div key={ph} className="trf-bank__down-col">
              <span className="trf-bank__down-wire" aria-hidden />
              <span className="trf-bank__down-lbl">
                {byPhase(ph)?.circuitRef.split('-').pop() ?? ph}
              </span>
            </div>
          ))}
        </div>
        <p className="trf-bank__hint">
          Salida 440 V → interruptor QVS del LCS (equipo independiente abajo)
        </p>
      </div>
    </div>
  )
}
