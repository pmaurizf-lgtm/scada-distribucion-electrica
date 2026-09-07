/**
 * Genera un LayoutDocument inicial a partir de la topología (sin coords en JSON).
 * Es una semilla editable: el producto geo permitirá mover nodos / rehacer cables.
 */
import type { DistributionData } from '../types'
import { buildBoardModels, type BoardModel, type FeederOutlet } from '../utils/cascadeModel'
import type { GeoNode, GeoWire, LayoutDocument } from './types'

const BOARD_GAP = 280
const BOARD_WIDTH = 920
const BUS_Y = 220
const BUS_H = 14
const GEN_Y = 80
const FEED_START_Y = 320
const FEED_PITCH = 56
const BREAKER_W = 44
const BREAKER_H = 36
const EQ_W = 160
const EQ_H = 40

function boardOriginX(index: number): number {
  return 80 + index * (BOARD_WIDTH + BOARD_GAP)
}

function placeBoard(
  board: BoardModel,
  boardIndex: number,
  nodes: GeoNode[],
  wires: GeoWire[],
): void {
  const ox = boardOriginX(boardIndex)
  const frameId = `frame:${board.id}`

  nodes.push({
    id: frameId,
    kind: 'frame',
    layer: 'structure',
    x: ox,
    y: 40,
    width: BOARD_WIDTH,
    height: 120 + Math.max(board.feeders.length, 4) * FEED_PITCH,
    label: board.name,
    equipmentId: board.id,
    tags: { boardId: board.id },
  })

  nodes.push({
    id: `text:${board.id}:title`,
    kind: 'text',
    layer: 'label',
    x: ox + 16,
    y: 48,
    width: BOARD_WIDTH - 32,
    height: 24,
    label: board.name,
    equipmentId: board.id,
  })

  // Barras SB (izq) | SA (der) — layout MSB congelado POPA/PROA
  const busSbId = `bus:${board.id}:SB`
  const busSaId = `bus:${board.id}:SA`
  const busW = (BOARD_WIDTH - 80) / 2 - 20
  const busSbX = ox + 40
  const busSaX = ox + 40 + busW + 40

  nodes.push({
    id: busSbId,
    kind: 'bus',
    layer: 'bus',
    x: busSbX,
    y: BUS_Y,
    width: busW,
    height: BUS_H,
    label: `${board.id} · SB`,
    tags: { half: 'SB', boardId: board.id },
  })
  nodes.push({
    id: busSaId,
    kind: 'bus',
    layer: 'bus',
    x: busSaX,
    y: BUS_Y,
    width: busW,
    height: BUS_H,
    label: `${board.id} · SA`,
    tags: { half: 'SA', boardId: board.id },
  })

  // QBT entre barras
  const qbt = board.sectionCoupler
  const qbtX = ox + BOARD_WIDTH / 2 - BREAKER_W / 2
  const qbtY = BUS_Y - 8
  nodes.push({
    id: `brk:${qbt.id}`,
    kind: 'breaker',
    layer: 'breaker',
    x: qbtX,
    y: qbtY,
    width: BREAKER_W,
    height: BREAKER_H,
    label: qbt.protectionName,
    circuitId: qbt.id,
    tags: { role: 'section-coupler', boardId: board.id },
  })
  wires.push({
    id: `wire:${qbt.id}`,
    layer: 'wire',
    circuitId: qbt.id,
    lineType: 'normal',
    points: [
      { x: busSbX + busW, y: BUS_Y + BUS_H / 2 },
      { x: qbtX, y: BUS_Y + BUS_H / 2 },
      { x: qbtX + BREAKER_W, y: BUS_Y + BUS_H / 2 },
      { x: busSaX, y: BUS_Y + BUS_H / 2 },
    ],
  })

  // Generadores encima de cada mitad
  for (const g of board.gens) {
    const onSb = g.half === 'SB'
    const busX = onSb ? busSbX : busSaX
    const cx = busX + busW / 2
    const genNodeId = `eq:${g.gen.id}`
    const brkId = `brk:${g.breaker.id}`

    nodes.push({
      id: genNodeId,
      kind: 'equipment',
      layer: 'equipment',
      x: cx - EQ_W / 2,
      y: GEN_Y,
      width: EQ_W,
      height: EQ_H,
      label: g.gen.name || g.gen.id,
      equipmentId: g.gen.id,
      tags: { half: g.half, role: 'generator', boardId: board.id },
    })
    nodes.push({
      id: brkId,
      kind: 'breaker',
      layer: 'breaker',
      x: cx - BREAKER_W / 2,
      y: GEN_Y + EQ_H + 12,
      width: BREAKER_W,
      height: BREAKER_H,
      label: g.breaker.protectionName,
      circuitId: g.breaker.id,
      tags: { half: g.half, role: 'gen-breaker', boardId: board.id },
    })
    wires.push({
      id: `wire:${g.breaker.id}`,
      layer: 'wire',
      circuitId: g.breaker.id,
      lineType: g.breaker.lineType,
      points: [
        { x: cx, y: GEN_Y + EQ_H },
        { x: cx, y: GEN_Y + EQ_H + 12 },
        { x: cx, y: BUS_Y },
      ],
    })
  }

  // Feeders bajo la barra (SB izq, SA der)
  const byHalf = {
    SB: board.feeders.filter((f) => f.half === 'SB'),
    SA: board.feeders.filter((f) => f.half === 'SA'),
  }

  const placeFeeds = (feeds: FeederOutlet[], half: 'SA' | 'SB') => {
    const busX = half === 'SB' ? busSbX : busSaX
    const pitch = Math.min(
      FEED_PITCH,
      busW / Math.max(feeds.length, 1),
    )
    feeds.forEach((f, i) => {
      const cx =
        feeds.length === 1
          ? busX + busW / 2
          : busX + pitch / 2 + i * pitch
      const brkY = FEED_START_Y
      const eqY = brkY + BREAKER_H + 16
      const brkId = `brk:${f.circuit.id}`
      const eqId = `eq:${f.equipment.id}`

      nodes.push({
        id: brkId,
        kind: 'breaker',
        layer: 'breaker',
        x: cx - BREAKER_W / 2,
        y: brkY,
        width: BREAKER_W,
        height: BREAKER_H,
        label: f.breaker || f.circuit.protectionName,
        circuitId: f.circuit.id,
        tags: { half, role: 'feeder', boardId: board.id },
      })
      nodes.push({
        id: eqId,
        kind: 'equipment',
        layer: 'equipment',
        x: cx - EQ_W / 2,
        y: eqY,
        width: EQ_W,
        height: EQ_H,
        label: f.equipment.name || f.equipment.id,
        equipmentId: f.equipment.id,
        tags: { half, role: 'feeder-load', boardId: board.id },
      })
      wires.push({
        id: `wire:${f.circuit.id}`,
        layer: 'wire',
        circuitId: f.circuit.id,
        lineType: f.circuit.lineType,
        points: [
          { x: cx, y: BUS_Y + BUS_H },
          { x: cx, y: brkY },
          { x: cx, y: brkY + BREAKER_H },
          { x: cx, y: eqY },
        ],
      })
    })
  }

  placeFeeds(byHalf.SB, 'SB')
  placeFeeds(byHalf.SA, 'SA')
}

/** Semilla geométrica de ambos MSB a partir de DistributionData. */
export function seedLayoutFromTopology(data: DistributionData): LayoutDocument {
  const boards = buildBoardModels(data)
  const nodes: GeoNode[] = []
  const wires: GeoWire[] = []

  boards.forEach((b, i) => placeBoard(b, i, nodes, wires))

  const maxFeed = Math.max(...boards.map((b) => b.feeders.length), 4)
  const width = boardOriginX(boards.length - 1) + BOARD_WIDTH + 80
  const height = FEED_START_Y + maxFeed * FEED_PITCH + 200

  return {
    v: 1,
    name: `${data.title || 'Unifilar'} · geometría`,
    unit: 'world',
    viewBox: { x: 0, y: 0, width, height },
    nodes,
    wires,
    meta: {
      seededFrom: data.sourceFile || 'system690',
      vessel: data.vessel,
      updatedAt: new Date().toISOString(),
      notes:
        'Semilla automática desde topología. Editar XY en este documento (o import futuro DXF) sin alterar CascadeView.',
    },
  }
}
