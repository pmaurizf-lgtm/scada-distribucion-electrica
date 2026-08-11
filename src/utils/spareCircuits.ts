import type { Circuit, DistributionData, Equipment } from '../types'

/**
 * Filas Excel con destino RESPETO / SPARE (omitidas en el import).
 * - 690 V: hoja «690V Power System», col. L = RESPETO (31 filas).
 * - 400 Hz: hoja «400Hz Power System», col. I = RESPETO (MSB-4SFS).
 * Fuente: 2600723_F110-…lista_circuitos_Rev.D_trabajo.xlsm
 */
const RESPETO_ROWS: {
  excelRow: number
  circuitRef: string
  originId: string
  protectionName: string
  protectionModel: string
  protectionCurrentA: number
  service?: 'VM' | 'VS' | 'NV' | null
  /** Tensión nominal (690 V por defecto; 440/115 en 400 Hz). */
  voltage?: string
  notes?: string
}[] = [
  // MSB PROA
  { excelRow: 30, circuitRef: 'MSB-6PWS0001-Q1A08', originId: 'PNL-MSB1004A', protectionName: 'Q1A08', protectionModel: 'NSX 250 HB2 M5.2E', protectionCurrentA: 250 },
  { excelRow: 37, circuitRef: 'MSB-6PWS0001-Q1A15', originId: 'PNL-MSB1007A', protectionName: 'Q1A15', protectionModel: 'NSX 400 HB2 M5.3E', protectionCurrentA: 400 },
  { excelRow: 60, circuitRef: 'MSB-6PWS0001-Q1B05', originId: 'PNL-MSB1003B', protectionName: 'Q1B05', protectionModel: 'NSX 250 HB2 M5.2E', protectionCurrentA: 250 },
  { excelRow: 68, circuitRef: 'MSB-6PWS0001-Q1B13', originId: 'PNL-MSB1007B', protectionName: 'Q1B13', protectionModel: 'NSX 400 HB2 M5.3E', protectionCurrentA: 400 },
  // MSB POPA
  { excelRow: 94, circuitRef: 'MSB-6PWS0002-Q2A08', originId: 'PNL-MSB2005A', protectionName: 'Q2A08', protectionModel: 'NSX 400 HB2 M5.3E', protectionCurrentA: 400 },
  { excelRow: 101, circuitRef: 'MSB-6PWS0002-Q2A15', originId: 'PNL-MSB2007A', protectionName: 'Q2A15', protectionModel: 'NSX 250 HB2 M5.2E', protectionCurrentA: 250 },
  { excelRow: 134, circuitRef: 'MSB-6PWS0002-Q2B18', originId: 'PNL-MSB2008B', protectionName: 'Q2B18', protectionModel: 'NSX 250 HB2 M5.2E', protectionCurrentA: 250 },
  { excelRow: 136, circuitRef: 'MSB-6PWS0002-Q2B20', originId: 'PNL-MSB2009B', protectionName: 'Q2B20', protectionModel: 'NSX 400 HB2 M5.3E', protectionCurrentA: 400 },
  // SSB
  { excelRow: 159, circuitRef: 'SSB-6PWS0001-4Q4', originId: 'SSB-6PWS0001', protectionName: 'Q4', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 100 },
  { excelRow: 181, circuitRef: 'SSB-6PWS0002-4Q5', originId: 'SSB-6PWS0002', protectionName: 'Q5', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 100 },
  // CCM
  { excelRow: 215, circuitRef: 'CCM-6PWS0001-19', originId: 'CCM-6PWS0001', protectionName: '36Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 216, circuitRef: 'CCM-6PWS0001-20', originId: 'CCM-6PWS0001', protectionName: '41Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 247, circuitRef: 'CCM-6PWS0002-16', originId: 'CCM-6PWS0002', protectionName: '40Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 248, circuitRef: 'CCM-6PWS0002-17', originId: 'CCM-6PWS0002', protectionName: '45Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 249, circuitRef: 'CCM-6PWS0002-18', originId: 'CCM-6PWS0002', protectionName: '50Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 281, circuitRef: 'CCM-6PWS0003-16', originId: 'CCM-6PWS0003', protectionName: '37Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 282, circuitRef: 'CCM-6PWS0003-17', originId: 'CCM-6PWS0003', protectionName: '42Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 314, circuitRef: 'CCM-6PWS0004-15', originId: 'CCM-6PWS0004', protectionName: '32Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 315, circuitRef: 'CCM-6PWS0004-16', originId: 'CCM-6PWS0004', protectionName: '37Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 341, circuitRef: 'CCM-6PWS0005-09', originId: 'CCM-6PWS0005', protectionName: '17Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 342, circuitRef: 'CCM-6PWS0005-10', originId: 'CCM-6PWS0005', protectionName: '22Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 376, circuitRef: 'CCM-6PWS0006-17', originId: 'CCM-6PWS0006', protectionName: '38Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 377, circuitRef: 'CCM-6PWS0006-18', originId: 'CCM-6PWS0006', protectionName: '43Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 378, circuitRef: 'CCM-6PWS0006-19', originId: 'CCM-6PWS0006', protectionName: '48Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 411, circuitRef: 'CCM-6PWS0007-17', originId: 'CCM-6PWS0007', protectionName: '38Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 412, circuitRef: 'CCM-6PWS0007-18', originId: 'CCM-6PWS0007', protectionName: '43Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 413, circuitRef: 'CCM-6PWS0007-19', originId: 'CCM-6PWS0007', protectionName: '48Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 443, circuitRef: 'CCM-6PWS0008-14', originId: 'CCM-6PWS0008', protectionName: '28Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 444, circuitRef: 'CCM-6PWS0008-15', originId: 'CCM-6PWS0008', protectionName: '33Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 476, circuitRef: 'CCM-6PWS0009-15', originId: 'CCM-6PWS0009', protectionName: '33Q1', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 477, circuitRef: 'CCM-6PWS0009-16', originId: 'CCM-6PWS0009', protectionName: '38Q1', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },

  // 400 Hz · MSB-4SFS0001 (hoja «400Hz Power System», col. I = RESPETO)
  { excelRow: 26, circuitRef: 'MSB-4SFS0001-Q03', originId: 'MSB-4SFS0001', protectionName: 'Q03', protectionModel: 'NSX 160 F M2.2', protectionCurrentA: 160, voltage: '440', notes: 'hz400' },
  { excelRow: 29, circuitRef: 'MSB-4SFS0001-Q05', originId: 'MSB-4SFS0001', protectionName: 'Q05', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '440', notes: 'hz400' },
  { excelRow: 30, circuitRef: 'MSB-4SFS0001-Q06', originId: 'MSB-4SFS0001', protectionName: 'Q06', protectionModel: 'NSX 160 F M2.2', protectionCurrentA: 160, voltage: '440', notes: 'hz400' },
  { excelRow: 31, circuitRef: 'MSB-4SFS0001-Q07', originId: 'MSB-4SFS0001', protectionName: 'Q07', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '440', notes: 'hz400' },
  { excelRow: 32, circuitRef: 'MSB-4SFS0001-Q08', originId: 'MSB-4SFS0001', protectionName: 'Q08', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 40, voltage: '440', notes: 'hz400' },
  { excelRow: 37, circuitRef: 'MSB-4SFS0001-Q53', originId: 'MSB-4SFS0001', protectionName: 'Q53', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },
  { excelRow: 38, circuitRef: 'MSB-4SFS0001-Q54', originId: 'MSB-4SFS0001', protectionName: 'Q54', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },
  { excelRow: 40, circuitRef: 'MSB-4SFS0001-Q56', originId: 'MSB-4SFS0001', protectionName: 'Q56', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },

  // 400 Hz · MSB-4SFS0002
  { excelRow: 111, circuitRef: 'MSB-4SFS0002-Q03', originId: 'MSB-4SFS0002', protectionName: 'Q03', protectionModel: 'NSX 160 F M2.2', protectionCurrentA: 160, voltage: '440', notes: 'hz400' },
  { excelRow: 114, circuitRef: 'MSB-4SFS0002-Q05', originId: 'MSB-4SFS0002', protectionName: 'Q05', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '440', notes: 'hz400' },
  { excelRow: 115, circuitRef: 'MSB-4SFS0002-Q06', originId: 'MSB-4SFS0002', protectionName: 'Q06', protectionModel: 'NSX 160 F M2.2', protectionCurrentA: 160, voltage: '440', notes: 'hz400' },
  { excelRow: 116, circuitRef: 'MSB-4SFS0002-Q07', originId: 'MSB-4SFS0002', protectionName: 'Q07', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '440', notes: 'hz400' },
  { excelRow: 122, circuitRef: 'MSB-4SFS0002-Q52', originId: 'MSB-4SFS0002', protectionName: 'Q52', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },
  { excelRow: 123, circuitRef: 'MSB-4SFS0002-Q53', originId: 'MSB-4SFS0002', protectionName: 'Q53', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },
  { excelRow: 124, circuitRef: 'MSB-4SFS0002-Q54', originId: 'MSB-4SFS0002', protectionName: 'Q54', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },
  { excelRow: 126, circuitRef: 'MSB-4SFS0002-Q56', originId: 'MSB-4SFS0002', protectionName: 'Q56', protectionModel: 'NSX 100 F M2.2', protectionCurrentA: 100, voltage: '115', notes: 'hz400' },
]

/**
 * Añade circuitos RESPETO (SPARE) del Excel omitidos en el import
 * (destino no es un tag de equipo válido).
 */
export function augmentSpareCircuits(data: DistributionData): DistributionData {
  const equipment = [...data.equipment]
  const circuits = [...data.circuits]
  const eqIds = new Set(equipment.map((e) => e.id))
  const circuitRefs = new Set(
    circuits.map((c) => c.circuitRef).filter(Boolean) as string[],
  )
  const circuitIds = new Set(circuits.map((c) => c.id))

  for (const row of RESPETO_ROWS) {
    if (circuitRefs.has(row.circuitRef)) continue

    const eqId = `SPARE-${row.circuitRef}`
    const circuitId = `synth-SPARE-${row.circuitRef}`
    if (circuitIds.has(circuitId)) continue

    if (!eqIds.has(eqId)) {
      equipment.push({
        id: eqId,
        name: 'RESPETO',
        kind: 'consumidor',
        description: `Circuito de reserva (col. L = RESPETO) · ${row.circuitRef}`,
        spare: true,
      })
      eqIds.add(eqId)
    }

    circuits.push({
      id: circuitId,
      name: `${row.originId} → RESPETO (${row.protectionName})`,
      originId: row.originId,
      destinationId: eqId,
      circuitRef: row.circuitRef,
      protectionName: row.protectionName,
      protectionModel: row.protectionModel,
      protectionCurrentA: row.protectionCurrentA,
      lineType: 'normal',
      service: row.service ?? 'NV',
      voltage: row.voltage ?? '690 V',
      parallelCables: 1,
      notes:
        row.notes === 'hz400'
          ? 'hz400 · RESPETO · interruptor de reserva (Excel col. I)'
          : 'RESPETO · interruptor de reserva (Excel col. L)',
      spare: true,
      excelRow: row.excelRow,
    })
    circuitRefs.add(row.circuitRef)
    circuitIds.add(circuitId)
  }

  return { ...data, equipment, circuits }
}

export function isSpareEquipment(eq: Equipment): boolean {
  return (
    !!eq.spare ||
    eq.name.toUpperCase() === 'SPARE' ||
    eq.name.toUpperCase() === 'RESPETO' ||
    eq.id.startsWith('SPARE-')
  )
}

export function isSpareCircuit(c: Circuit): boolean {
  return !!c.spare || c.destinationId.startsWith('SPARE-')
}
