import * as XLSX from 'xlsx'
import type { StartupReport } from './types'
import { buildStartupTableRows } from './tableRows'

function slug(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 48) || 'puesta-en-marcha'
  )
}

/**
 * Excel de la tabla resumen (mismas columnas que el A4 del PDF).
 */
export function exportStartupTableExcel(report: StartupReport): void {
  const rows = buildStartupTableRows(report)
  const aoa: (string | number)[][] = [
    [
      'Alimentación normal',
      '',
      '',
      'Alimentación alternativa',
      '',
      '',
      'Origen',
      '',
      'Destino',
      '',
    ],
    [
      'Equipo',
      'Local',
      'Protección',
      'Equipo',
      'Local',
      'Protección',
      'Equipo',
      'Local',
      'Destino',
      'Protección',
    ],
    ...rows.map((r) => [
      r.normEquip,
      r.normLocal,
      r.normProt,
      r.altEquip,
      r.altLocal,
      r.altProt,
      r.originEquip,
      r.originLocal,
      r.destEquip,
      r.destProt,
    ]),
  ]

  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 0, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } },
    { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } },
  ]
  sheet['!cols'] = Array.from({ length: 10 }, () => ({ wch: 18 }))

  const wb = XLSX.utils.book_new()
  const sheetName = (report.title.trim() || 'Tabla resumen').slice(0, 31)
  XLSX.utils.book_append_sheet(wb, sheet, sheetName)

  XLSX.writeFile(wb, `informe-puesta-en-marcha-${slug(report.title)}.xlsx`)
}
