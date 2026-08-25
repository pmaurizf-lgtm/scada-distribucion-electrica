import type { ProtectionState } from '../types'
import type { StartupReport } from '../startupFeeds/types'
import { SearchTreeView } from './SearchTreeView'

export function StartupReportTrees({
  report,
  title,
  printId,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
}: {
  report: StartupReport
  title: string
  printId?: string
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
}) {
  return (
    <div id={printId} className="startup-trees">
      <header className="startup-trees__doc-title">
        <h2>{title}</h2>
        <p>
          {report.groups.length} origen
          {report.groups.length === 1 ? '' : 'es'} ·{' '}
          {report.resolvedIds.length} equipo
          {report.resolvedIds.length === 1 ? '' : 's'} · árbol SCADA (MSB →
          destinos)
        </p>
      </header>

      {report.groups.map((group) => {
        const leaves = group.destinations.filter(
          (d) => d.equipmentId !== group.originId,
        )
        const destCount = group.destinations.length
        return (
          <section
            key={group.originId}
            className="startup-trees__group"
            aria-label={`Origen ${group.originId}`}
          >
            <SearchTreeView
              equipmentId={group.originId}
              trace={group.originTrace}
              protectionStatus={protectionStatus}
              lockedCircuits={lockedCircuits}
              energizedCircuitIds={energizedCircuitIds}
              energizedEquipmentIds={energizedEquipmentIds}
              onBreaker={() => {}}
              hubDownstream={leaves.length > 0 ? leaves : undefined}
              reportMode
              showHeader={false}
              groupCaption={`Origen ${group.originId} · ${destCount} destino${destCount === 1 ? '' : 's'}`}
            />
          </section>
        )
      })}
    </div>
  )
}
