import type { Circuit, DistributionData, Equipment } from '../types'
import {
  incomingFeeds,
  isAux24Feed,
  isPendingFeed,
  msb24SourceForAuxOrigin,
} from '../utils/cascadeModel'
import { filterUpstreamIncoming } from '../utils/upstream'

/** Un escalón de la cadena fuente → … → destino. */
export interface FeedChainHop {
  step: number
  equipmentId: string
  equipmentName: string
  local?: string
  /** Protección que alimenta este equipo desde el escalón anterior (`—` en la fuente). */
  protectionName: string
  circuitId?: string
  lineType?: 'normal' | 'alternativa'
}

export type FeedLineKind = 'normal' | 'alternativa'

function eqMap(data: DistributionData): Map<string, Equipment> {
  return new Map(data.equipment.map((e) => [e.id, e]))
}

function pickFeed(
  feeds: Circuit[],
  prefer: FeedLineKind,
): Circuit | undefined {
  const real = feeds.filter((c) => !c.virtual)
  if (!real.length) return undefined

  if (prefer === 'alternativa') {
    return (
      real.find((c) => c.lineType === 'alternativa') ??
      real.find((c) => isPendingFeed(c))
    )
  }

  const norms = real.filter(
    (c) => c.lineType === 'normal' && !isPendingFeed(c),
  )
  if (norms.length) return norms[0]
  return real.find((c) => !isPendingFeed(c)) ?? real[0]
}

/**
 * Cadena ordenada fuente → destino siguiendo preferencia NORM o ALT
 * en el primer salto; el resto aguas arriba prioriza alimentación normal.
 * Si se pide ALT y el destino no tiene acometida alternativa, devuelve [].
 */
export function buildOrderedFeedChain(
  destinationId: string,
  data: DistributionData,
  linePreference: FeedLineKind,
): FeedChainHop[] {
  const equipment = eqMap(data)

  type Node = { id: string; fedBy?: Circuit }
  const chainUp: Node[] = [{ id: destinationId }]

  let viaVoltage: string | null = null
  let atTarget = true
  let prefer = linePreference
  const seen = new Set<string>([destinationId])

  while (true) {
    const current = chainUp[chainUp.length - 1]!.id
    let incoming = incomingFeeds(data, current)
    if (!atTarget) {
      incoming = incoming.filter((c) => !isAux24Feed(c))
    }
    incoming = filterUpstreamIncoming(current, incoming, viaVoltage)

    const feed = pickFeed(incoming, prefer)
    if (!feed) {
      if (atTarget && linePreference === 'alternativa') return []
      break
    }
    if (atTarget && linePreference === 'alternativa') {
      const isAlt =
        feed.lineType === 'alternativa' || isPendingFeed(feed)
      if (!isAlt) return []
    }

    chainUp[chainUp.length - 1]!.fedBy = feed

    let nextId = feed.originId
    if (isAux24Feed(feed)) {
      nextId = msb24SourceForAuxOrigin(data, feed.originId)
    }
    if (seen.has(nextId)) break
    seen.add(nextId)

    chainUp.push({ id: nextId })
    viaVoltage = feed.voltage ?? viaVoltage
    atTarget = false
    prefer = 'normal'
  }

  const ordered = [...chainUp].reverse()
  return ordered.map((node, i) => {
    const eq = equipment.get(node.id)
    const fedBy = node.fedBy
    return {
      step: i + 1,
      equipmentId: node.id,
      equipmentName: eq?.name ?? node.id,
      local: eq?.local,
      protectionName: fedBy?.protectionName?.trim() || '—',
      circuitId: fedBy?.id,
      lineType:
        fedBy == null
          ? undefined
          : fedBy.lineType === 'alternativa' || isPendingFeed(fedBy)
            ? 'alternativa'
            : 'normal',
    }
  })
}

export function formatChainArrow(hops: FeedChainHop[]): string {
  if (!hops.length) return '—'
  return hops
    .map((h, i) => {
      const loc = h.local?.trim() ? ` [${h.local.trim()}]` : ''
      if (i === 0) return `${h.equipmentId}${loc}`
      const prot =
        h.protectionName && h.protectionName !== '—'
          ? ` —${h.protectionName}→ `
          : ' → '
      return `${prot}${h.equipmentId}${loc}`
    })
    .join('')
}
