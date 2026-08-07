/**
 * Extensión aguas abajo de ABT (ABT → TRF → LCS 440/230).
 * No modifica el núcleo MSB 690 V. Ver `.cursor/rules/msb-690-frozen.mdc`.
 */

export type {
  AbtChain,
  LoadCenter,
  LoadCenterVoltage,
  LcsBoardModel,
  LcsOutlet,
  LcsParallelIncoming,
  LcsSection,
  LcsVoltageBus,
} from './types'

export {
  buildAbtChains,
  buildLcsBoardModel,
  findAbtChain,
  isLcsEquipment,
  isTrfWithLoadCenter,
  trfLoadCenterFeed,
  windingNotesForTrf,
} from './model'

export {
  mergeAbtDownstream,
  abtDownstreamChainsMeta,
  trfWindingLegs,
  type TrfPhase,
  type TrfWindingLeg,
} from './merge'

export {
  LCS_STYLE_PROFILE,
  LCS_LAYOUT_TOKENS,
  LCS_BUS_COLORS,
  LCS_VOLTAGE_LAYOUT,
  LCS_SERVICE_ORDER,
  LCS_FEED_STYLE,
  LCS_BALLOON_FIELDS,
  type LcsStyleProfile,
} from './lcsBoardStyle'
