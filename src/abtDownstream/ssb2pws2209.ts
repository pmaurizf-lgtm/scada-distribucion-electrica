/**
 * SSB-2PWS2209 (navegación 230 V): multi-barra SALIDAS 1/2/3 + UPS + Q0T.
 */

import type { Circuit, DistributionData, Equipment } from '../types'

export const SSB_2PWS2209_ID = 'SSB-2PWS2209'

export const SSB_2209_QA_NOTE = 'ssb-2209-qa'
export const SSB_2209_TIE_NOTE = 'ssb-2209-tie'
export const SSB_2209_INT_NOTE = 'ssb-2209-internal'

export const SSB_2209_S1 = `BUS-${SSB_2PWS2209_ID}-S1`
export const SSB_2209_S2 = `BUS-${SSB_2PWS2209_ID}-S2`
export const SSB_2209_S3 = `BUS-${SSB_2PWS2209_ID}-S3`
export const SSB_2209_Q03_BUS = `BUS-${SSB_2PWS2209_ID}-Q03`
export const SSB_2209_QA_BUS = `BUS-${SSB_2PWS2209_ID}-QA`
export const SSB_2209_UPS = `UPS-${SSB_2PWS2209_ID}`

export function isSsb2Pws2209(id: string): boolean {
  return id === SSB_2PWS2209_ID
}

export function isSsb2209SectionBus(eq: Equipment): boolean {
  return Boolean(
    eq.virtual &&
      /^BUS-SSB-2PWS2209-(S[123]|Q03|QA)$/i.test(eq.id),
  )
}

export function isSsb2209Ups(eq: Equipment): boolean {
  return eq.id === SSB_2209_UPS
}

function byProt(
  data: DistributionData,
  originId: string,
  protectionName: string,
): Circuit | undefined {
  return data.circuits.find(
    (c) =>
      !c.virtual &&
      c.originId === originId &&
      c.protectionName === protectionName,
  )
}

export type Ssb2209Model = {
  qn: Circuit | undefined
  qa: Circuit | undefined
  q0tI: Circuit | undefined
  q0tII: Circuit | undefined
  q03: Circuit | undefined
  q01: Circuit | undefined
  q02: Circuit | undefined
  q04: Circuit | undefined
  q05: Circuit | undefined
  s1: Equipment | undefined
  s2: Equipment | undefined
  s3: Equipment | undefined
  q03Bus: Equipment | undefined
  qaBus: Equipment | undefined
  ups: Equipment | undefined
  q03Outlets: Circuit[]
  s3Outlets: Circuit[]
}

export function buildSsb2209Model(data: DistributionData): Ssb2209Model {
  const eq = (id: string) => data.equipment.find((e) => e.id === id)
  const from = (originId: string) =>
    data.circuits
      .filter((c) => !c.virtual && c.originId === originId)
      .sort((a, b) =>
        a.protectionName.localeCompare(b.protectionName, undefined, {
          numeric: true,
        }),
      )

  return {
    qn: byProt(data, SSB_2PWS2209_ID, 'QN'),
    qa: byProt(data, SSB_2PWS2209_ID, 'QA'),
    q0tI: byProt(data, SSB_2209_S1, 'Q0T-I'),
    q0tII: byProt(data, SSB_2209_QA_BUS, 'Q0T-II'),
    q03: byProt(data, SSB_2209_S1, 'Q03'),
    q01: byProt(data, SSB_2209_S2, 'Q01'),
    q02: byProt(data, SSB_2209_UPS, 'Q02'),
    q04: byProt(data, SSB_2209_S2, 'Q04'),
    q05: byProt(data, SSB_2209_S2, 'Q05'),
    s1: eq(SSB_2209_S1),
    s2: eq(SSB_2209_S2),
    s3: eq(SSB_2209_S3),
    q03Bus: eq(SSB_2209_Q03_BUS),
    qaBus: eq(SSB_2209_QA_BUS),
    ups: eq(SSB_2209_UPS),
    q03Outlets: from(SSB_2209_Q03_BUS),
    s3Outlets: from(SSB_2209_S3),
  }
}
