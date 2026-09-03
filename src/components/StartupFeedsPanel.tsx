import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { system690 } from '../data/system690'
import type { ProtectionState } from '../types'
import {
  buildStartupReport,
  buildStartupTableRows,
  parseDestinationsFromText,
  parseDestinationsFromWorkbook,
  summarizeGroups,
  type StartupReport,
} from '../startupFeeds'
import { exportStartupPdf } from '../startupFeeds/exportPdf'
import { StartupReportTrees } from './StartupReportTrees'

export function StartupFeedsPanel({
  onClose,
  protectionStatus,
  lockedCircuits,
  energizedCircuitIds,
  energizedEquipmentIds,
}: {
  onClose: () => void
  protectionStatus: Record<string, ProtectionState>
  lockedCircuits: Set<string>
  energizedCircuitIds: Set<string>
  energizedEquipmentIds: Set<string>
}) {
  const MAX_FEEDS_EXCEL_BYTES = 10 * 1024 * 1024
  const ALLOWED_FEEDS_EXCEL_RE = /\.(xlsx|xls|xlsm)$/i

  const excelRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('Alimentaciones puesta en marcha')
  const [manualText, setManualText] = useState('')
  const [report, setReport] = useState<StartupReport | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tableRows = useMemo(
    () => (report ? buildStartupTableRows(report) : []),
    [report],
  )

  const applyQueries = useCallback(
    (queries: string[], nextTitle?: string) => {
      if (!queries.length) {
        setHint('No se encontraron IDs de equipo en la entrada.')
        setReport(null)
        return
      }
      const t = nextTitle?.trim() || title
      const built = buildStartupReport(queries, system690, t)
      setReport(built)
      setTitle(t)
      const parts = [
        `${queries.length} pedido${queries.length === 1 ? '' : 's'}`,
        summarizeGroups(built.groups),
      ]
      if (built.unresolved.length) {
        parts.push(
          `${built.unresolved.length} no encontrado${built.unresolved.length === 1 ? '' : 's'}: ${built.unresolved.slice(0, 5).join(', ')}${built.unresolved.length > 5 ? '…' : ''}`,
        )
      }
      setHint(parts.join(' · '))
    },
    [title],
  )

  const handleExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_FEEDS_EXCEL_RE.test(file.name) || !file.size) {
      setHint('Archivo Excel de destinos no válido.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_FEEDS_EXCEL_BYTES) {
      setHint(
        `Excel demasiado grande (${Math.round(file.size / 1024 / 1024)} MiB). Máx. ${Math.round(
          MAX_FEEDS_EXCEL_BYTES / 1024 / 1024,
        )} MiB.`,
      )
      e.target.value = ''
      return
    }
    try {
      const buf = await file.arrayBuffer()
      const ids = parseDestinationsFromWorkbook(buf)
      const base = file.name.replace(/\.(xlsx|xls|xlsm)$/i, '')
      applyQueries(
        ids,
        title === 'Alimentaciones puesta en marcha' ? base : title,
      )
    } catch {
      setHint('No se pudo leer el Excel. Usa una hoja con IDs PUMA (p. ej. CCM-…).')
    }
    e.target.value = ''
  }

  const handleManualApply = () => {
    applyQueries(parseDestinationsFromText(manualText))
  }

  const handlePdf = async () => {
    if (!report) return
    const trees = document.getElementById('startup-print-a3')
    const table = document.getElementById('startup-print-a4')
    if (!trees || !table) {
      setHint('No hay contenido para imprimir.')
      return
    }
    setBusy(true)
    setHint('Generando PDF (A3 árbol + A4 apaisado tabla)…')
    try {
      await exportStartupPdf({ ...report, title }, trees, table)
      setHint(`PDF generado · ${title} (A3 árbol + A4 apaisado tabla)`)
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'desconocido'
      setHint(`Error al generar el PDF: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="startup-panel">
      <header className="startup-panel__head">
        <div>
          <h1 className="startup-panel__h1">Puesta en marcha · alimentaciones</h1>
          <p className="startup-panel__sub">
            Carga solo los equipos a alimentar; el SCADA calcula aguas arriba y
            agrupa por origen común. El árbol usa el mismo aspecto que la
            búsqueda de alimentaciones.
          </p>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Volver al unifilar
        </button>
      </header>

      <section className="startup-panel__controls" aria-label="Entrada">
        <label className="startup-panel__field">
          <span>Título del informe</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="p. ej. NECESIDADES PUESTA EN MARCHA MEP"
          />
        </label>
        <div className="startup-panel__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => excelRef.current?.click()}
          >
            Cargar Excel (destinos)
          </button>
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => void handleExcel(e)}
          />
          <a
            className="btn"
            href={`${import.meta.env.BASE_URL}ejemplos/alimentaciones-destinos-ejemplo.xlsx`}
            download
          >
            Ejemplo Excel
          </a>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!report || busy}
            onClick={() => void handlePdf()}
          >
            {busy ? 'Generando…' : 'Exportar informe PDF'}
          </button>
        </div>
        <label className="startup-panel__field startup-panel__field--grow">
          <span>Equipos manuales (uno por línea o separados por coma)</span>
          <textarea
            rows={3}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={'UPS-PROP0001\nCCM-PROP0002\nPMP-SWCS0002'}
          />
        </label>
        <button type="button" className="btn" onClick={handleManualApply}>
          Aplicar lista
        </button>
      </section>

      {hint && <div className="banner">{hint}</div>}

      {report && (
        <div className="startup-panel__preview">
          <section className="startup-panel__tree-wrap" aria-label="Árbol">
            <h2 className="startup-panel__h2">Árbol de alimentaciones</h2>
            <div className="startup-panel__scroll startup-panel__scroll--stree">
              <StartupReportTrees
                report={report}
                title={title}
                printId="startup-print-a3"
                protectionStatus={protectionStatus}
                lockedCircuits={lockedCircuits}
                energizedCircuitIds={energizedCircuitIds}
                energizedEquipmentIds={energizedEquipmentIds}
              />
            </div>
          </section>

          <section className="startup-panel__table-wrap" aria-label="Tabla">
            <h2 className="startup-panel__h2">Tabla resumen</h2>
            <div id="startup-print-a4" className="startup-table-print">
              <h3 className="startup-table-print__title">{title}</h3>
              <table className="startup-table">
                <thead>
                  <tr>
                    <th colSpan={3}>Alimentación normal</th>
                    <th colSpan={3}>Alimentación alternativa</th>
                    <th colSpan={2}>Origen</th>
                    <th colSpan={2}>Destino</th>
                  </tr>
                  <tr>
                    <th>Equipo</th>
                    <th>Local</th>
                    <th>Protección</th>
                    <th>Equipo</th>
                    <th>Local</th>
                    <th>Protección</th>
                    <th>Equipo</th>
                    <th>Local</th>
                    <th>Destino</th>
                    <th>Protección</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        r.isGroupStart ? 'startup-table__row--group' : undefined
                      }
                    >
                      <td>{r.normEquip}</td>
                      <td>{r.normLocal}</td>
                      <td>{r.normProt}</td>
                      <td>{r.altEquip}</td>
                      <td>{r.altLocal}</td>
                      <td>{r.altProt}</td>
                      <td>{r.originEquip}</td>
                      <td>{r.originLocal}</td>
                      <td>{r.destEquip}</td>
                      <td>{r.destProt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
