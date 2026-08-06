/**
 * Extensión aguas abajo de ABT (ABT → TRF → LCS 440/230).
 * No modifica el núcleo MSB 690 V. Ver `.cursor/rules/msb-690-frozen.mdc`.
 */

export type {
  AbtChain,
  LoadCenter,
  LoadCenterVoltage,
} from './types'

export {
  buildAbtChains,
  findAbtChain,
  abtDownstreamEquipmentIds,
} from './model'
