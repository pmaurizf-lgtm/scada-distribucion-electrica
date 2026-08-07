/**
 * Perfil de estilo canónico del LCS dual — plantilla LCS-4PWS0001.
 * Actualizado: 2026-08-07 (padding chasis simétrico, globo con Local, TRF dual+zoom).
 *
 * Cualquier LCS nuevo (ABT→TRF→LCS 440/230) reutiliza este perfil vía
 * `LcsDualView` + CSS `.lcs-dual` / `.lcs440-*` / `.equip-chassis--lcs`.
 * No inventar layouts distintos por id de LCS.
 *
 * Referencia visual: LCS-4PWS0001 (CENTRO DE CARGA N-1).
 */

import type { LoadCenterVoltage } from './types'
import type { ServiceClass } from '../types'

/** Orden de servicios en barra (440: izq→der; 230 espejo: der→izq = mismo orden lógico). */
export const LCS_SERVICE_ORDER: ServiceClass[] = ['VS', 'VM', 'NV']

/** Tensiones del LCS dual y su disposición horizontal. */
export const LCS_VOLTAGE_LAYOUT = {
  /** Izquierda, rail espejado NV—QNV—VM—QVM—VS */
  left: '230' as LoadCenterVoltage,
  /** Derecha, rail normal VS—QVM—VM—QNV—NV */
  right: '440' as LoadCenterVoltage,
  mirrorLeft: true,
} as const

/**
 * Tokens de layout (deben coincidir con CSS en App.css).
 * Chasis: padding izq = der para que las barras no peguen al borde.
 */
export const LCS_LAYOUT_TOKENS = {
  tieWidth: '4.6rem',
  vsColMin: '7.2rem',
  busGap: '2.1rem',
  qvsLegWidth: '3.4rem',
  feedColFallback: '7.2rem',
  dualRailsGap: '0.85rem',
  /** `.equip-chassis--lcs` — mismo valor izq/der */
  chassisPadX: '0.55rem',
  chassisPadTop: '0.25rem',
  chassisPadBottom: '0.65rem',
  chassisMarginTop: '0.35rem',
} as const

/** Colores de barra / acoplador por tensión (desenergizado). */
export const LCS_BUS_COLORS = {
  '440': {
    bus: 'linear-gradient(90deg, #6a8aaa, #9ab4c8 45%, #6a8aaa)',
    tie: '#7dcfb0',
    tag: { bg: 'rgba(61, 138, 122, 0.35)', fg: '#b8e8dc' },
  },
  '230': {
    bus: 'linear-gradient(90deg, #8a7040, #c9a86a 45%, #8a7040)',
    tie: '#b89a5c',
    tag: { bg: 'rgba(138, 106, 61, 0.4)', fg: '#f0d9a8' },
  },
} as const

/** Entradas TRF→LCS (una bajante por tensión, alineada a QVS). */
export const LCS_FEED_STYLE = {
  qvsPrefix: 'QVS-',
  preferredQvs: 'QVS-440',
  /** Dos bajantes; sync mide chips QVS y corrige `transform: scale(zoom)` */
  dualStubsFromTrf: true,
  /**
   * Alimentación paralela a QVS (p. ej. CSB→QS1-440 en LCS-4PWS0003):
   * estira barra VS 440 y sitúa el origen a la derecha del TRF.
   */
  parallelTopFeed: {
    protectionPrefix: 'QS',
    cssClass: 'lcs440-board--parallel-feed',
  },
  cssVars: [
    '--feed-col',
    '--feed-offset',
    '--trf-out-230',
    '--trf-out-440',
    '--trf-stub-h',
  ] as const,
  sectionBreakers: { VM: 'QVM-', NV: 'QNV-' },
} as const

/**
 * Campos del globo de equipo (mismo criterio MSB + Local siempre visible).
 * Datos: Excel 440/230 + locals desde Main Equipment Report si col. K falla.
 */
export const LCS_BALLOON_FIELDS = [
  'PUMA',
  'DCP-10',
  'Nombre',
  'Tipo',
  'Local',
  'Tensión',
  'Protección',
  'Modelo',
  'In',
  'Ib',
  'P',
  'Q',
  'S',
  'Pn',
  'Servicio',
  'Ref. circuito',
  'Cable',
  'Alimentaciones',
] as const

/**
 * Contrato UI al clonar un LCS:
 * - Datos: `abtDownstream.json` → `buildLcsBoardModel`
 * - Vista: `<LcsDualView lcsId={…} />` (atributo `data-lcs-style=LCS-4PWS0001`)
 * - Estilo: este perfil + CSS `.lcs-dual` / `.lcs440-*` / `.equip-chassis--lcs`
 * - Cadena: ABT/TRF con `--feed-col` / `--feed-offset`; clase `hbus-drop--dual-feed`
 * - Scripts de datos: `scripts/enrich-lcs-balloon-fields.mjs`, `scripts/fill-lcs-locals.mjs`
 */
export const LCS_STYLE_PROFILE = {
  referenceId: 'LCS-4PWS0001',
  referenceName: 'CENTRO DE CARGA N-1',
  version: '2026-08-07',
  voltages: LCS_VOLTAGE_LAYOUT,
  services: LCS_SERVICE_ORDER,
  layout: LCS_LAYOUT_TOKENS,
  colors: LCS_BUS_COLORS,
  feed: LCS_FEED_STYLE,
  balloon: LCS_BALLOON_FIELDS,
  outlets: {
    useMsbDropFormat: true,
    component: 'EquipmentBusDrop',
    sectionClass: 'hbus--lcs-section',
    normColor: 'var(--line-normal)',
    altColor: 'var(--line-alt)',
  },
  labels: {
    busTagPosition: 'above-start' as const,
    mirrorTagPosition: 'above-end' as const,
    chassisLabel: 'left' as const,
  },
  cssHooks: {
    dualRoot: 'lcs-dual lcs-dual--both',
    board: 'lcs440-board',
    rail: 'lcs440-rail',
    railMirror: 'lcs440-rail--mirror',
    chassis: 'equip-chassis equip-chassis--lcs',
    dualFeed: 'hbus-drop--dual-feed',
  },
} as const

export type LcsStyleProfile = typeof LCS_STYLE_PROFILE
