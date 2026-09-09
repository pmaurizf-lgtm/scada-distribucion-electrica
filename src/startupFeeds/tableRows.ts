import { system690 } from '../data/system690'
import type { DistributionData } from '../types'
import {
  buildOrderedFeedChain,
  formatChainArrow,
  type FeedChainHop,
  type FeedLineKind,
} from './feedChain'
import type { StartupGroup, StartupReport } from './types'

/** Fila de la tabla resumen (un escalón de la cadena por fila). */
export interface StartupTableRow {
  /** Primera fila del bloque destino (incluye resumen de cadena). */
  isDestStart: boolean
  /** Primera fila de la línea Normal/Alternativa dentro del destino. */
  isLineStart: boolean
  destEquip: string
  destLocal: string
  destName: string
  lineKind: FeedLineKind
  lineLabel: string
  step: number
  hopEquip: string
  hopLocal: string
  hopName: string
  hopProt: string
  /** Solo en isDestStart + línea normal: cadena completa con flechas. */
  chainSummary: string
  hops: FeedChainHop[]
}

function dash(v?: string | null): string {
  const s = (v ?? '').trim()
  return s || '—'
}

function pushChainRows(
  rows: StartupTableRow[],
  dest: {
    equipmentId: string
    equipmentName: string
    local?: string
  },
  lineKind: FeedLineKind,
  hops: FeedChainHop[],
  isFirstLineOfDest: boolean,
): void {
  if (!hops.length) return
  const lineLabel = lineKind === 'normal' ? 'Normal' : 'Alternativa'
  const summary = formatChainArrow(hops)

  hops.forEach((h, i) => {
    const isDestStart = isFirstLineOfDest && i === 0
    rows.push({
      isDestStart,
      isLineStart: i === 0,
      destEquip: dest.equipmentId,
      destLocal: dash(dest.local),
      destName: dest.equipmentName,
      lineKind,
      lineLabel,
      step: h.step,
      hopEquip: h.equipmentId,
      hopLocal: dash(h.local),
      hopName: h.equipmentName,
      hopProt: dash(h.protectionName),
      chainSummary: isDestStart ? summary : '',
      hops,
    })
  })
}

/**
 * Tabla por destino: cadena completa Normal (+ Alternativa si existe),
 * un escalón por fila (fuente → … → destino).
 */
export function buildStartupTableRows(
  report: StartupReport,
  data: DistributionData = system690,
): StartupTableRow[] {
  const rows: StartupTableRow[] = []

  const dests = report.groups.flatMap((g) =>
    g.destinations.length
      ? g.destinations
      : [
          {
            equipmentId: g.originId,
            equipmentName: g.originName,
            local: g.originLocal,
            query: g.originId,
            protectionName: '—',
            circuitId: '',
            lineType: 'normal' as const,
          },
        ],
  )

  dests.sort((a, b) => a.equipmentId.localeCompare(b.equipmentId, 'es'))

  for (const d of dests) {
    const norm = buildOrderedFeedChain(d.equipmentId, data, 'normal')
    const alt = buildOrderedFeedChain(d.equipmentId, data, 'alternativa')

    const destInfo = {
      equipmentId: d.equipmentId,
      equipmentName: d.equipmentName,
      local: d.local,
    }

    if (!norm.length && !alt.length) {
      rows.push({
        isDestStart: true,
        isLineStart: true,
        destEquip: d.equipmentId,
        destLocal: dash(d.local),
        destName: d.equipmentName,
        lineKind: 'normal',
        lineLabel: 'Normal',
        step: 1,
        hopEquip: d.equipmentId,
        hopLocal: dash(d.local),
        hopName: d.equipmentName,
        hopProt: '—',
        chainSummary: d.equipmentId,
        hops: [],
      })
      continue
    }

    pushChainRows(rows, destInfo, 'normal', norm, true)
    pushChainRows(rows, destInfo, 'alternativa', alt, !norm.length)
  }

  return rows
}

export function summarizeGroups(groups: StartupGroup[]): string {
  const nDest = groups.reduce((a, g) => a + g.destinations.length, 0)
  return `${groups.length} origen${groups.length === 1 ? '' : 'es'} · ${nDest} destino${nDest === 1 ? '' : 's'}`
}
