import type { Circuit, DistributionData, Equipment, LineType } from '../types'
import { isMsbFeeder, feederSection } from './viewFilter'

export type BoardId = 'MSB-6PWS0001' | 'MSB-6PWS0002'
export type BusHalf = 'SA' | 'SB'

export interface FeederOutlet {
  circuit: Circuit
  equipment: Equipment
  half: BusHalf
  breaker: string
}

export interface BoardModel {
  id: BoardId
  name: string
  local?: string
  /** Acoplador de sección SA↔SB (QBT1 / QBT2) */
  sectionCoupler: Circuit
  /** Enlace a la otra barra (bus-tie) */
  busTie: Circuit[]
  gens: { half: BusHalf; gen: Equipment; breaker: Circuit }[]
  feeders: FeederOutlet[]
}

/** Circuitos sintéticos de acoplamiento de sección (no vienen del Excel) */
export function sectionCouplerCircuit(boardId: BoardId): Circuit {
  if (boardId === 'MSB-6PWS0001') {
    return {
      id: 'synth-QBT1',
      circuitRef: 'MSB-6PWS0001-QBT1',
      name: 'Acoplamiento 1SB ↔ 1SA',
      originId: 'PNL-MSB1001B',
      destinationId: 'PNL-MSB1001A',
      protectionName: 'QBT1',
      protectionModel: 'Motorizado · acoplador de sección',
      lineType: 'normal',
      service: 'VS',
      voltage: '690',
      notes: 'Acoplador de barras 1SB-1SA (sintético)',
    }
  }
  return {
    id: 'synth-QBT2',
    circuitRef: 'MSB-6PWS0002-QBT2',
    name: 'Acoplamiento 2SB ↔ 2SA',
    originId: 'PNL-MSB2001B',
    destinationId: 'PNL-MSB2001A',
    protectionName: 'QBT2',
    protectionModel: 'Motorizado · acoplador de sección',
    lineType: 'normal',
    service: 'VS',
    voltage: '690',
    notes: 'Acoplador de barras 2SB-2SA (sintético)',
  }
}

export function allSectionCouplers(): Circuit[] {
  return [sectionCouplerCircuit('MSB-6PWS0001'), sectionCouplerCircuit('MSB-6PWS0002')]
}

export function halfFromPanel(panelId: string): BusHalf | null {
  // PNL-MSB1001A → barra 1, sección 001, mitad A (SA)
  // PNL-MSB2008B → barra 2, sección 008, mitad B (SB)
  const m = panelId.match(/MSB([12])\d{3}([AB])$/i)
  if (!m) return null
  return m[2].toUpperCase() === 'A' ? 'SA' : 'SB'
}

export function halfFromFeeder(circuit: Circuit): BusHalf | null {
  const sec = feederSection(circuit)
  if (!sec) return null
  return sec.endsWith('A') ? 'SA' : 'SB'
}

export function boardFromOrigin(originId: string): BoardId | null {
  if (/PNL-MSB10|MSB-6PWS0001|SDG-GENS000[12]/.test(originId)) return 'MSB-6PWS0001'
  if (/PNL-MSB20|MSB-6PWS0002|SDG-GENS000[34]/.test(originId)) return 'MSB-6PWS0002'
  return null
}

/** Orden del esquema funcional: POPA (N-2) a la izquierda, PROA (N-1) a la derecha */
export function buildBoardModels(data: DistributionData): BoardModel[] {
  const eq = (id: string) => data.equipment.find((e) => e.id === id)!

  /** gens: [SB, SA] — orden visual del plano (G*B | G*A) */
  const boards: {
    id: BoardId
    name: string
    gens: [string, string]
  }[] = [
    {
      id: 'MSB-6PWS0002',
      name: 'CUADRO PRINCIPAL POPA (MSB-6PWS0002)',
      gens: ['SDG-GENS0004', 'SDG-GENS0003'],
    },
    {
      id: 'MSB-6PWS0001',
      name: 'CUADRO PRINCIPAL PROA (MSB-6PWS0001)',
      gens: ['SDG-GENS0002', 'SDG-GENS0001'],
    },
  ]

  const qt1b = data.circuits.find((c) => c.protectionName === 'QT1B')
  const qt2a = data.circuits.find((c) => c.protectionName === 'QT2A')

  return boards.map((b) => {
    const boardEq = eq(b.id)
    const gens = b.gens.map((genId, idx) => {
      const half: BusHalf = idx === 0 ? 'SB' : 'SA'
      const breaker = data.circuits.find((c) => c.originId === genId)!
      return { half, gen: eq(genId), breaker }
    })

    const feeders: FeederOutlet[] = data.circuits
      .filter((c) => isMsbFeeder(c) && boardFromOrigin(c.originId) === b.id)
      .map((c) => ({
        circuit: c,
        equipment: eq(c.destinationId),
        half: halfFromFeeder(c) ?? halfFromPanel(c.originId) ?? 'SA',
        breaker: c.protectionName,
      }))
      .sort((a, b2) => a.breaker.localeCompare(b2.breaker, undefined, { numeric: true }))

    /** Interconexión 2SA↔1SB: QT2A en N-2 (SA), QT1B en N-1 (SB) */
    const busTie =
      b.id === 'MSB-6PWS0002'
        ? qt2a
          ? [qt2a]
          : []
        : qt1b
          ? [qt1b]
          : []

    return {
      id: b.id,
      name: boardEq?.name ?? b.name,
      local: boardEq?.local,
      sectionCoupler: sectionCouplerCircuit(b.id),
      busTie,
      gens,
      feeders,
    }
  })
}

export function busTieCircuits(data: DistributionData): {
  qt2a?: Circuit
  qt1b?: Circuit
} {
  return {
    qt2a: data.circuits.find((c) => c.protectionName === 'QT2A'),
    qt1b: data.circuits.find((c) => c.protectionName === 'QT1B'),
  }
}

/** Circuitos hijos reales (no virtuales) que salen de un equipo */
export function childFeeders(
  data: DistributionData,
  equipmentId: string,
): { circuit: Circuit; equipment: Equipment }[] {
  return data.circuits
    .filter(
      (c) =>
        !c.virtual &&
        c.originId === equipmentId &&
        c.destinationId !== equipmentId,
    )
    .map((c) => ({
      circuit: c,
      equipment: data.equipment.find((e) => e.id === c.destinationId)!,
    }))
    .filter((x) => x.equipment)
    .sort((a, b) =>
      a.circuit.protectionName.localeCompare(b.circuit.protectionName, undefined, {
        numeric: true,
      }),
    )
}

/** Cuadro principal 24 VDC (MSB-24PWxxxx). */
export function isMsb24Equipment(id: string): boolean {
  return /^MSB-24PW/i.test(id)
}

/**
 * Cuadro MSB-24PWxxxx del que cuelga un origen AUX (p. ej. SSB-24 → MSB-24).
 * Si no hay, devuelve el propio originId.
 */
export function msb24SourceForAuxOrigin(
  data: DistributionData,
  originId: string,
): string {
  if (isMsb24Equipment(originId)) return originId
  const seen = new Set<string>()
  let cur = originId
  for (let i = 0; i < 16; i++) {
    if (seen.has(cur)) break
    seen.add(cur)
    if (isMsb24Equipment(cur)) return cur
    const incoming = data.circuits.filter(
      (c) =>
        !c.virtual &&
        c.destinationId === cur &&
        !isMsb24Interconnect(c),
    )
    const norms = incoming.filter((c) => c.lineType === 'normal')
    const use = norms.length > 0 ? norms : incoming
    const direct = use.find((c) => isMsb24Equipment(c.originId))
    if (direct) return direct.originId
    const next = use[0]
    if (!next) break
    cur = next.originId
  }
  return originId
}

/** Rectificador 24 V (RCT-24PWxxxx). */
export function isRct24Equipment(id: string): boolean {
  return /^RCT-24PW/i.test(id)
}

/**
 * Acoplamiento entre MSB-24 (cualquier Q): no anidar como salida de carga;
 * se muestra solo como pierna ALT de acometida.
 */
export function isMsb24Interconnect(circuit: Circuit): boolean {
  return (
    circuit.notes === 'msb24-interconnect' ||
    (isMsb24Equipment(circuit.originId) &&
      isMsb24Equipment(circuit.destinationId))
  )
}

/**
 * Hijos para anidar en el unifilar: excluye retorno al padre de acometida
 * y a ancestros ya abiertos (rompe ciclos p. ej. SSB↔TRF que congelan al expandir).
 * También excluye acopladores MSB-24↔MSB-24 y MSB-4SFS↔MSB-4SFS.
 */
export function nestableChildFeeders(
  data: DistributionData,
  equipmentId: string,
  options?: {
    /** Origen del circuito que alimenta este equipo (padre inmediato). */
    feedParentId?: string | null
    /** Cadena ya visitada por encima en el árbol expandido. */
    ancestorIds?: ReadonlySet<string>
  },
): { circuit: Circuit; equipment: Equipment }[] {
  const blocked = new Set<string>()
  blocked.add(equipmentId)
  if (options?.feedParentId) blocked.add(options.feedParentId)
  if (options?.ancestorIds) {
    for (const id of options.ancestorIds) blocked.add(id)
  }
  return childFeeders(data, equipmentId).filter(
    (x) =>
      !blocked.has(x.equipment.id) &&
      !isMsb24Interconnect(x.circuit) &&
      !isMsb4SfsPeerTie(x.circuit),
  )
}

/** Acoplador entre cuadros principales 400 Hz (Q01 / Q51). */
export function isMsb4SfsPeerTie(circuit: Circuit): boolean {
  return (
    !circuit.virtual &&
    /^MSB-4SFS/i.test(circuit.originId) &&
    /^MSB-4SFS/i.test(circuit.destinationId) &&
    circuit.originId !== circuit.destinationId
  )
}

/**
 * Varias acometidas al mismo equipo (p.ej. Q17 y Q18 → PSP-SGUN0001):
 * las salidas llevan `circuitRef` `{feedRef}-NN`. Devuelve solo las de esta
 * acometida; si ninguna encaja (esquema distinto), deja todas.
 */
export function feedScopedChildFeeders(
  kids: { circuit: Circuit; equipment: Equipment }[],
  feedCircuit: Circuit,
): { circuit: Circuit; equipment: Equipment }[] {
  const feedRef = (feedCircuit.circuitRef || '').trim()
  if (!feedRef) return kids
  const prefix = `${feedRef}-`
  const scoped = kids.filter((k) => {
    const ref = (k.circuit.circuitRef || '').trim()
    return ref.length > 0 && ref.startsWith(prefix)
  })
  return scoped.length > 0 ? scoped : kids
}

/** Origen stub cuando la 2.ª alimentación aún no está identificada en Excel. */
export const PENDING_ORIGIN_ID = 'ORIGEN-PENDIENTE'

export function isPendingOrigin(originId: string): boolean {
  return originId === PENDING_ORIGIN_ID
}

export function isPendingFeed(circuit: Circuit): boolean {
  return isPendingOrigin(circuit.originId)
}

/** Enlace ABT → TRF: sin interruptor en el unifilar (solo cable). */
export function isAbtToTransformerFeed(circuit: Circuit): boolean {
  return (
    circuit.originId.startsWith('ABT-') &&
    circuit.destinationId.startsWith('TRF-')
  )
}

/**
 * Cualquier salida de un ABT: sin interruptor de cabecera en el unifilar
 * (solo cable hasta SSB/TRF/carga).
 */
export function isAbtOutgoingFeed(circuit: Circuit): boolean {
  return !circuit.virtual && circuit.originId.startsWith('ABT-')
}

/**
 * QVS TRF→LCS: el chip vive en la barra VS bajo el LCS, no entre TRF y LCS.
 * En el árbol se pinta como enlace continuo (como ABT→TRF).
 */
export function isTrfToLcsQvsFeed(circuit: Circuit): boolean {
  return (
    !circuit.virtual &&
    circuit.originId.startsWith('TRF-') &&
    circuit.destinationId.startsWith('LCS-') &&
    /^QVS-/i.test(circuit.protectionName)
  )
}

/**
 * Otras alimentaciones QVS del mismo TRF→LCS (p. ej. QVS-230 si la local es QVS-440).
 * Con el LCS plegado hay que pintar ambas piernas; `pairedRemoteFeeds` no las
 * empareja porque ambas son NORM.
 */
export function siblingTrfQvsFeeds(
  feeds: Circuit[],
  localFeed: Circuit,
): Circuit[] {
  if (!isTrfToLcsQvsFeed(localFeed)) return []
  const rank = (c: Circuit) => {
    if (/230/i.test(c.protectionName)) return 0
    if (/440/i.test(c.protectionName)) return 1
    return 2
  }
  return feeds
    .filter(
      (c) =>
        c.id !== localFeed.id &&
        isTrfToLcsQvsFeed(c) &&
        c.originId === localFeed.originId &&
        c.destinationId === localFeed.destinationId,
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.protectionName.localeCompare(b.protectionName, 'es'),
    )
}

/** Piernas QVS a pintar con LCS plegado: 230 a la izquierda, 440 a la derecha. */
export function foldedLcsQvsLegs(
  feeds: Circuit[],
  localFeed: Circuit,
): Circuit[] | null {
  if (!isTrfToLcsQvsFeed(localFeed)) return null
  const rank = (c: Circuit) => {
    if (/230/i.test(c.protectionName)) return 0
    if (/440/i.test(c.protectionName)) return 1
    return 2
  }
  const all = [localFeed, ...siblingTrfQvsFeeds(feeds, localFeed)]
  const seen = new Set<string>()
  const uniq: Circuit[] = []
  for (const c of all) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    uniq.push(c)
  }
  return uniq.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.protectionName.localeCompare(b.protectionName, 'es'),
  )
}

/** Entrada paralela QS* (CSB→LCS) a la misma barra VS que QVS. */
export function isParallelLcsTopFeed(circuit: Circuit): boolean {
  return (
    !circuit.virtual &&
    circuit.destinationId.startsWith('LCS-') &&
    /^QS\d/i.test(circuit.protectionName) &&
    !circuit.originId.startsWith('TRF-')
  )
}

/** Salida de LCS a carga (no QVM/QNV ni bus placeholder). */
export function isLcsOutletFeed(circuit: Circuit): boolean {
  return (
    !circuit.virtual &&
    circuit.originId.startsWith('LCS-') &&
    !circuit.destinationId.startsWith('BUS-') &&
    !/^QVM-|^QNV-/i.test(circuit.protectionName) &&
    !/^QS\d/i.test(circuit.protectionName)
  )
}

/** Etiqueta de origen para UI / globos. */
export function originLabel(originId: string): string {
  return isPendingOrigin(originId) ? 'PENDIENTE' : originId
}

/** Todas las alimentaciones entrantes a un equipo (normal / alt.) */
export function incomingFeeds(
  data: DistributionData,
  equipmentId: string,
): Circuit[] {
  return data.circuits.filter(
    (c) => !c.virtual && c.destinationId === equipmentId,
  )
}

function sortRemoteLegs(list: Circuit[]): Circuit[] {
  return [...list].sort((a, b) => {
    const rank = (c: Circuit) =>
      c.lineType === 'normal' ? 0 : isPendingFeed(c) ? 2 : 1
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return a.protectionName.localeCompare(b.protectionName, 'es')
  })
}

/**
 * Piernas remotas a pintar junto a la acometida local.
 * Empareja NORM↔ALT (mismo `protectionName`; huérfanos por orden) para no
 * apilar las N ALT de circuitos paralelos distintos (p. ej. PWP-GENS con 6
 * acometidas al mismo destino).
 */
export function pairedRemoteFeeds(
  feeds: Circuit[],
  localFeed: Circuit,
): Circuit[] {
  const power = feeds.filter((c) => !isAux24Feed(c))
  const hasAltOrPending = power.some(
    (c) => c.lineType === 'alternativa' || isPendingFeed(c),
  )
  if (!hasAltOrPending) return []

  const others = power.filter((c) => c.id !== localFeed.id)
  if (others.length === 0) return []

  // 1) Misma protección, tipo de línea distinto (o pendiente)
  const sameName = others.filter((c) => {
    if (c.protectionName !== localFeed.protectionName) return false
    if (isPendingFeed(c)) return true
    return c.lineType !== localFeed.lineType
  })
  if (sameName.length > 0) return sortRemoteLegs(sameName)

  // 2) Emparejar por nombre entre NORM y ALT; huérfanos por orden (Q09↔Q10)
  const norms = power
    .filter((c) => c.lineType === 'normal' && !isPendingFeed(c))
    .sort((a, b) => a.protectionName.localeCompare(b.protectionName, 'es'))
  const alts = power
    .filter((c) => c.lineType === 'alternativa' || isPendingFeed(c))
    .sort((a, b) => a.protectionName.localeCompare(b.protectionName, 'es'))

  const usedAlt = new Set<string>()
  const usedNorm = new Set<string>()
  type Pair = { norm?: Circuit; alt?: Circuit }
  const pairs: Pair[] = []

  for (const n of norms) {
    const a = alts.find(
      (x) => !usedAlt.has(x.id) && x.protectionName === n.protectionName,
    )
    if (a) {
      usedAlt.add(a.id)
      usedNorm.add(n.id)
      pairs.push({ norm: n, alt: a })
    }
  }
  const orphanNorms = norms.filter((n) => !usedNorm.has(n.id))
  const orphanAlts = alts.filter((a) => !usedAlt.has(a.id))
  const zip = Math.max(orphanNorms.length, orphanAlts.length)
  for (let i = 0; i < zip; i++) {
    pairs.push({ norm: orphanNorms[i], alt: orphanAlts[i] })
  }

  const mine = pairs.find(
    (p) => p.norm?.id === localFeed.id || p.alt?.id === localFeed.id,
  )
  if (mine) {
    const remotes: Circuit[] = []
    if (mine.norm && mine.norm.id !== localFeed.id) remotes.push(mine.norm)
    if (mine.alt && mine.alt.id !== localFeed.id) remotes.push(mine.alt)
    return sortRemoteLegs(remotes)
  }

  // 3) Fallback: todas las del otro tipo (destino 1 NORM + N ALT)
  const localIsAlt =
    localFeed.lineType === 'alternativa' || isPendingFeed(localFeed)
  return sortRemoteLegs(
    others.filter((c) => {
      if (c.lineType === 'alternativa' || isPendingFeed(c)) return true
      return localIsAlt && c.lineType === 'normal'
    }),
  )
}

export function lineBadge(t: LineType): string {
  return t === 'alternativa' ? 'ALT' : 'NORM'
}

/** Circuito 24 VDC (voltage «24» / «24 V»). */
export function is24VCircuit(circuit: Circuit): boolean {
  const v = String(circuit.voltage ?? '')
    .replace(/\s*V$/i, '')
    .trim()
  return v === '24' || v.startsWith('24')
}

/** ¿Tensión de potencia (no 24 V auxiliares)? */
export function isPowerVoltageCircuit(circuit: Circuit): boolean {
  if (circuit.virtual) return false
  if (is24VCircuit(circuit)) return false
  const v = String(circuit.voltage ?? '')
    .replace(/\s*V$/i, '')
    .trim()
  return (
    v.startsWith('690') ||
    v.startsWith('440') ||
    v.startsWith('230') ||
    v.startsWith('115')
  )
}

/**
 * Destinos tipificados como AUX 24 V (maniobra / control de cuadros).
 * Además, cualquier 24 V a un equipo con acometida de potencia se marca
 * `notes: aux-24` en el import.
 */
export function isAux24Destination(equipmentId: string): boolean {
  return (
    /^LCS-/i.test(equipmentId) ||
    /^CCM-/i.test(equipmentId) ||
    /^MSB-6PWS/i.test(equipmentId) ||
    /^PNL-MSB[12]000$/i.test(equipmentId)
  )
}

export const AUX_24_NOTE = 'aux-24'

/** Alimentación auxiliar 24 V (maniobra/control), no NORM/ALT de potencia. */
export function isAux24Feed(circuit: Circuit): boolean {
  if (circuit.virtual || !is24VCircuit(circuit)) return false
  if (circuit.notes === AUX_24_NOTE) return true
  return isAux24Destination(circuit.destinationId)
}

/**
 * ¿El equipo tiene alguna acometida de potencia (690/440/230/115)?
 * Sirve para clasificar un 24 V paralelo como AUX.
 */
export function hasPowerVoltageFeed(
  data: DistributionData,
  equipmentId: string,
  exceptCircuitId?: string,
): boolean {
  return data.circuits.some(
    (c) =>
      !c.virtual &&
      c.destinationId === equipmentId &&
      c.id !== exceptCircuitId &&
      isPowerVoltageCircuit(c),
  )
}

/** Panel 0 24 V asociado a cada MSB 690. */
export function msbAux24PanelId(msbId: string): string | null {
  if (msbId === 'MSB-6PWS0001') return 'PNL-MSB1000'
  if (msbId === 'MSB-6PWS0002') return 'PNL-MSB2000'
  return null
}

/** MSB 690 que aloja el panel 0 AUX 24 V (`PNL-MSB1000` / `2000`). */
export function msbIdFromAux24Panel(panelId: string): BoardId | null {
  if (panelId === 'PNL-MSB1000') return 'MSB-6PWS0001'
  if (panelId === 'PNL-MSB2000') return 'MSB-6PWS0002'
  return null
}

/**
 * Equipo a revelar en planta al saltar desde un AUX 24 V (receptor).
 * Los paneles 0 virtuales se mapean al MSB donde se pinta la pierna AUX.
 */
export function aux24JumpRevealId(circuit: Circuit): string {
  return msbIdFromAux24Panel(circuit.destinationId) ?? circuit.destinationId
}

/** Circuitos AUX 24 V entrantes (LCS, CCM, panel 0 MSB, etc.). */
export function aux24FeedsForEquipment(
  data: DistributionData,
  equipmentId: string,
): Circuit[] {
  const panel =
    /^MSB-6PWS/i.test(equipmentId)
      ? msbAux24PanelId(equipmentId)
      : null
  const destIds = panel ? [equipmentId, panel] : [equipmentId]
  return data.circuits.filter(
    (c) =>
      !c.virtual &&
      destIds.includes(c.destinationId) &&
      isAux24Feed(c),
  )
}

/** Primer circuito AUX 24 V entrante (compat). */
export function aux24FeedForEquipment(
  data: DistributionData,
  equipmentId: string,
): Circuit | undefined {
  return aux24FeedsForEquipment(data, equipmentId)[0]
}
