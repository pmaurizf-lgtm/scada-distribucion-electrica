import type { StartupGroup, StartupReport } from './types'

/** Fila de la tabla A4 (estilo Excel MEP). */
export interface StartupTableRow {
  /** Primera fila del grupo: rellena NORM/ALT/origen; siguientes solo destino */
  isGroupStart: boolean
  normEquip: string
  normLocal: string
  normProt: string
  altEquip: string
  altLocal: string
  altProt: string
  originEquip: string
  originLocal: string
  destEquip: string
  destProt: string
}

function dash(v?: string | null): string {
  const s = (v ?? '').trim()
  return s || '—'
}

export function buildStartupTableRows(report: StartupReport): StartupTableRow[] {
  const rows: StartupTableRow[] = []
  for (const g of report.groups) {
    const dests =
      g.destinations.length > 0
        ? g.destinations
        : [
            {
              equipmentId: g.originId,
              equipmentName: g.originName,
              protectionName: '—',
            },
          ]
    dests.forEach((d, i) => {
      const start = i === 0
      rows.push({
        isGroupStart: start,
        normEquip: start ? dash(g.norm?.equipmentId) : '',
        normLocal: start ? dash(g.norm?.local) : '',
        normProt: start ? dash(g.norm?.protectionName) : '',
        altEquip: start ? dash(g.alt?.equipmentId) : '',
        altLocal: start ? dash(g.alt?.local) : '',
        altProt: start ? dash(g.alt?.protectionName) : '',
        originEquip: start ? g.originId : '',
        originLocal: start ? dash(g.originLocal) : '',
        destEquip:
          d.equipmentId === g.originId && dests.length === 1
            ? '—'
            : d.equipmentId,
        destProt: dash(d.protectionName),
      })
    })
  }
  return rows
}

export function summarizeGroups(groups: StartupGroup[]): string {
  const nDest = groups.reduce((a, g) => a + g.destinations.length, 0)
  return `${groups.length} origen${groups.length === 1 ? '' : 'es'} · ${nDest} destino${nDest === 1 ? '' : 's'}`
}
