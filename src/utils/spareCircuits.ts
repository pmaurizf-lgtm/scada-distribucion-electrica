import type { Circuit, DistributionData, Equipment } from '../types'

/**
 * Filas Excel (hoja «690V Power System») con columna L = «RESPETO».
 * Col. I no trae tag de equipo (valor numérico); se sintetiza destino SPARE.
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
  { excelRow: 215, circuitRef: 'CCM-6PWS0001-19', originId: 'CCM-6PWS0001', protectionName: 'Q19', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 216, circuitRef: 'CCM-6PWS0001-20', originId: 'CCM-6PWS0001', protectionName: 'Q20', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 247, circuitRef: 'CCM-6PWS0002-16', originId: 'CCM-6PWS0002', protectionName: 'Q16', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 248, circuitRef: 'CCM-6PWS0002-17', originId: 'CCM-6PWS0002', protectionName: 'Q17', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 249, circuitRef: 'CCM-6PWS0002-18', originId: 'CCM-6PWS0002', protectionName: 'Q18', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 281, circuitRef: 'CCM-6PWS0003-16', originId: 'CCM-6PWS0003', protectionName: 'Q16', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 282, circuitRef: 'CCM-6PWS0003-17', originId: 'CCM-6PWS0003', protectionName: 'Q17', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 314, circuitRef: 'CCM-6PWS0004-15', originId: 'CCM-6PWS0004', protectionName: 'Q15', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 315, circuitRef: 'CCM-6PWS0004-16', originId: 'CCM-6PWS0004', protectionName: 'Q16', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 341, circuitRef: 'CCM-6PWS0005-09', originId: 'CCM-6PWS0005', protectionName: 'Q09', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 342, circuitRef: 'CCM-6PWS0005-10', originId: 'CCM-6PWS0005', protectionName: 'Q10', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 376, circuitRef: 'CCM-6PWS0006-17', originId: 'CCM-6PWS0006', protectionName: 'Q17', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 377, circuitRef: 'CCM-6PWS0006-18', originId: 'CCM-6PWS0006', protectionName: 'Q18', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 378, circuitRef: 'CCM-6PWS0006-19', originId: 'CCM-6PWS0006', protectionName: 'Q19', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 411, circuitRef: 'CCM-6PWS0007-17', originId: 'CCM-6PWS0007', protectionName: 'Q17', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 412, circuitRef: 'CCM-6PWS0007-18', originId: 'CCM-6PWS0007', protectionName: 'Q18', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 413, circuitRef: 'CCM-6PWS0007-19', originId: 'CCM-6PWS0007', protectionName: 'Q19', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 443, circuitRef: 'CCM-6PWS0008-14', originId: 'CCM-6PWS0008', protectionName: 'Q14', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 444, circuitRef: 'CCM-6PWS0008-15', originId: 'CCM-6PWS0008', protectionName: 'Q15', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
  { excelRow: 476, circuitRef: 'CCM-6PWS0009-15', originId: 'CCM-6PWS0009', protectionName: 'Q15', protectionModel: 'TESYS-U 12A', protectionCurrentA: 12, service: 'VS' },
  { excelRow: 477, circuitRef: 'CCM-6PWS0009-16', originId: 'CCM-6PWS0009', protectionName: 'Q16', protectionModel: 'NSX 100 HB1 M2.2', protectionCurrentA: 40, service: 'VS' },
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
      voltage: '690 V',
      parallelCables: 1,
      notes: 'RESPETO · interruptor de reserva (Excel col. L)',
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
