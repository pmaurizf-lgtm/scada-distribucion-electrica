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

export {
  hasSsbBoardLayout,
  isDownstreamPanelBoard,
  isSsb115BusCircuit,
  isSsb115InternalBus,
  isSsbIncomingCircuit,
  isSsbIncomingSwitchName,
  isInsProtectionName,
  isMotorizedProtectionModel,
  ssbIncomingCircuit,
  SSB_115_BUS_NOTE,
  SSB_INCOMING_NOTE,
} from './ssbBoard'

export {
  buildSsb2209Model,
  isSsb2Pws2209,
  isSsb2209SectionBus,
  isSsb2209Ups,
  SSB_2PWS2209_ID,
  SSB_2209_INT_NOTE,
  SSB_2209_QA_NOTE,
  SSB_2209_TIE_NOTE,
} from './ssb2pws2209'
