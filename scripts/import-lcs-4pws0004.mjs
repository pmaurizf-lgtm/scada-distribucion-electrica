/**
 * Importa cadena ABT-6PWS0004 → TRF-6PWS0004 → LCS-4PWS0004
 * con el mismo criterio que LCS-4PWS0001 / 0002.
 */
import { readFileSync, writeFileSync } from 'fs'

const base =
  'C:/Users/pmouriz/AppData/Local/Temp/xlsm_lcs_enrich/unpacked/xl'
const jsonPath =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'

const LCS = 'LCS-4PWS0004'
const TRF = 'TRF-6PWS0004'
const ABT = 'ABT-6PWS0004'

const ssXml = readFileSync(`${base}/sharedStrings.xml`, 'utf8')
const strings = []
for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  strings.push(
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''),
  )
}

function parseSheet(path) {
  const xml = readFileSync(path, 'utf8')
  const rows = new Map()
  for (const cm of xml.matchAll(
    /<c r="([A-Z]+)(\d+)"([^>]*)>(?:[\s\S]*?<v>([^<]*)<\/v>)?/g,
  )) {
    const col = cm[1]
    const row = +cm[2]
    const attrs = cm[3]
    const v = cm[4]
    if (v == null) continue
    let val = v
    if (/t="s"/.test(attrs)) val = strings[+val] ?? val
    else if (/^-?\d/.test(val)) val = Number(val)
    if (!rows.has(row)) rows.set(row, {})
    rows.get(row)[col] = val
  }
  return rows
}

function str(v) {
  if (v == null) return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const s = String(v).trim()
  if (!s || s === 'NaN' || s === '#N/A' || s === '#¡VALOR!' || s === '#VALUE!')
    return null
  return s
}

function num(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function round6(v) {
  if (v == null) return null
  return Math.round(v * 1e6) / 1e6
}

function isPuma(v) {
  return typeof v === 'string' && /^[A-Z]{2,}-/.test(v)
}

function isRespeto(dest, desc) {
  if (!isPuma(dest)) return true
  const d = (desc ?? '').toUpperCase()
  return d.includes('RESPETO') || d.includes('SPARE')
}

function protectionFromRow(row, circuitRef) {
  const ad = str(row.AD)
  if (ad && !/^\d+(\.\d+)?$/.test(ad)) return ad
  if (circuitRef?.startsWith(`${LCS}-`)) {
    return circuitRef.slice(LCS.length + 1).replace(/_/g, '-')
  }
  if (circuitRef?.startsWith(`${TRF}-`)) {
    return circuitRef.slice(TRF.length + 1)
  }
  return ad ?? circuitRef ?? '?'
}

function kindOf(destId, desc) {
  if (destId.startsWith('BUS-')) return 'cuadro_secundario'
  if (isRespeto(destId, desc)) return 'consumidor'
  if (destId.startsWith('TRF-') || destId.startsWith('XFMR')) return 'conversion'
  if (
    destId.startsWith('SSB-') ||
    destId.startsWith('ABT-') ||
    destId.startsWith('LCS-') ||
    destId.startsWith('CSB-')
  )
    return 'cuadro_secundario'
  if (destId.startsWith('TBX-') || destId.startsWith('JBX-')) return 'consumidor'
  const d = (desc ?? '').toUpperCase()
  if (d.includes('CUADRO') || d.includes('CENTRO DE CARGA')) return 'cuadro_secundario'
  if (d.includes('TRANSFORMADOR')) return 'conversion'
  return 'consumidor'
}

function serviceOf(v) {
  const s = str(v)
  if (s === 'VS' || s === 'VM' || s === 'NV') return s
  return 'VS'
}

/** Sección por nomenclatura de protección (1Q/4Q→VS, 2Q/5Q→VM, 3Q/6Q→NV). */
function serviceFromProtection(protName) {
  const m = String(protName ?? '').match(/^([1-6])Q/i)
  if (!m) return null
  const n = +m[1]
  if (n === 1 || n === 4) return 'VS'
  if (n === 2 || n === 5) return 'VM'
  if (n === 3 || n === 6) return 'NV'
  return null
}

function buildLocalMap() {
  const report = parseSheet(`${base}/worksheets/sheet15.xml`)
  const map = new Map()
  for (const [, row] of report) {
    const puma = row.B
    if (!isPuma(puma)) continue
    const h = str(row.H)
    if (!h) continue
    const loc = h.includes(' ') ? h.slice(0, h.indexOf(' ')) : h
    if (!map.has(puma)) map.set(puma, loc)
  }
  return map
}

function findCableSectionCol(headerRow) {
  for (const [col, val] of Object.entries(headerRow)) {
    const s = String(val).toLowerCase()
    if (/section|secci[oó]n|mm²|mm2|s\s*\[mm/.test(s)) return col
  }
  return 'Y'
}

function extractVoltage(rows, voltage, localMap, startId) {
  let headerRow = null
  let headerRn = 10
  for (const [rn, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (rn > 15) break
    const vals = Object.values(row).map(String)
    if (vals.some((v) => /Origin Puma/i.test(v))) {
      headerRow = row
      headerRn = rn
      break
    }
  }
  const cableCol = headerRow ? findCableSectionCol(headerRow) : 'Y'
  console.log(voltage, 'header', headerRn, 'cableCol', cableCol, headerRow?.[cableCol])

  const equipment = new Map()
  const circuits = []
  let seq = startId

  equipment.set(LCS, {
    id: LCS,
    name: 'CENTRO DE CARGA N-4',
    kind: 'cuadro_secundario',
    voltage: '440/230',
    local: localMap.get(LCS) ?? null,
    spare: false,
  })

  for (const [rn, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (rn <= headerRn) continue
    const origin = str(row.E)
    const destRaw = row.I
    const circuitRef = str(row.D)
    const destDesc = str(row.L)
    const destLocalRaw = str(row.K)

    const fromTrf =
      origin === TRF &&
      (String(destRaw) === LCS ||
        (circuitRef && circuitRef.startsWith(`${TRF}-`)))
    const fromLcs = origin === LCS
    if (!fromTrf && !fromLcs) continue
    if (!circuitRef) continue

    const spare = isRespeto(destRaw, destDesc)
    let destId
    if (fromTrf) {
      destId = LCS
    } else if (spare) {
      const prot = protectionFromRow(row, circuitRef)
      destId = `SPARE-${LCS}-${prot.replace(/[^A-Za-z0-9-]/g, '')}`
    } else if (isPuma(destRaw)) {
      destId = destRaw
    } else {
      const prot = protectionFromRow(row, circuitRef)
      destId = `SPARE-${LCS}-${prot.replace(/[^A-Za-z0-9-]/g, '')}`
    }

    const protName = protectionFromRow(row, circuitRef)
    const isWinding =
      fromTrf &&
      /-(11|12|13|21|22|23)$/.test(circuitRef) &&
      !/QVS/i.test(circuitRef)
    const isQvs = /QVS/i.test(protName) || /QVS/i.test(circuitRef)
    const isQvm = /^QVM/i.test(protName) || /QVM/i.test(circuitRef)
    const isQnv = /^QNV/i.test(protName) || /QNV/i.test(circuitRef)
    const isQsParallel = /^QS\d/i.test(protName) || /QS\d/i.test(circuitRef || '')
    const isSection = isQvm || isQnv

    let service = serviceOf(row.N)
    const svcFromProt = serviceFromProtection(protName)
    // Prefijo nQ manda sobre Excel (a veces marca VM en respetos 3Qxx)
    if (svcFromProt) service = svcFromProt
    if (isQvm) service = 'VM'
    if (isQnv) service = 'NV'
    if (isQvs) service = 'VS'

    if (isSection && fromLcs) {
      const busId = `BUS-${LCS}-${voltage}-${service}`
      destId = busId
      if (!equipment.has(busId)) {
        equipment.set(busId, {
          id: busId,
          name: `Barra ${voltage} V · ${service}`,
          kind: 'cuadro_secundario',
          voltage: String(voltage),
          virtual: true,
          spare: false,
        })
      }
    }

    // QS* LCS↔CSB: alimentación alternativa hacia el LCS (paralela a QVS)
    let originId = origin
    const mCol = str(row.M)
    let lineType =
      mCol === 'Alternative' || mCol === 'Alternativa'
        ? 'alternativa'
        : 'normal'
    let notes =
      mCol === 'Alternative' || mCol === 'Normal' || mCol === 'Alternativa'
        ? `Col. M Excel: ${mCol}`
        : null
    if (isQsParallel && fromLcs && isPuma(destRaw) && !spare) {
      const csbId = destRaw
      if (!equipment.has(csbId)) {
        equipment.set(csbId, {
          id: csbId,
          name: destDesc || csbId,
          kind: kindOf(csbId, destDesc),
          voltage: String(voltage),
          local:
            destLocalRaw && destLocalRaw !== 'NaN'
              ? destLocalRaw
              : localMap.get(csbId) ?? null,
          spare: false,
          virtual: false,
        })
      }
      originId = csbId
      destId = LCS
      lineType = 'normal'
      notes = 'Alimentación paralela CSB → LCS (junto a TRF/QVS)'
    }

    const spareFlag = isSection || isQsParallel ? false : spare

    if (!equipment.has(destId) && destId !== LCS) {
      const local =
        destLocalRaw && destLocalRaw !== 'NaN'
          ? destLocalRaw
          : localMap.get(destId) ?? null
      equipment.set(destId, {
        id: destId,
        name: spareFlag ? 'RESPETO' : destDesc || destId,
        kind: kindOf(destId, destDesc),
        voltage: String(voltage),
        local: spareFlag ? null : local,
        spare: !!spareFlag,
        virtual: false,
      })
    } else if (equipment.has(destId) && !spareFlag) {
      const eq = equipment.get(destId)
      if (!eq.local) {
        const local =
          destLocalRaw && destLocalRaw !== 'NaN'
            ? destLocalRaw
            : localMap.get(destId) ?? null
        if (local) eq.local = local
      }
      if (destDesc && (eq.name === eq.id || !eq.name)) eq.name = destDesc
    }

    let pKWe = round6(num(row.AJ))
    let qKVAr = round6(num(row.AK))
    let sKVA = round6(num(row.AL))
    let ibA = round6(num(row.AM))
    let pnKW = round6(num(row.O))
    if (spareFlag && pKWe != null && pKWe > 5000) {
      pKWe = null
      qKVAr = null
      sKVA = null
      ibA = null
    }

    const cableSection = str(row[cableCol])
    const sectionOk =
      cableSection &&
      !/^P2/i.test(cableSection) &&
      (/^\d/.test(cableSection) || cableSection.includes('×'))

    const parallel = num(row.X)

    let protectionName = protName
    if (isQvm) protectionName = `QVM-${voltage}`
    if (isQnv) protectionName = `QNV-${voltage}`
    if (isQvs) protectionName = `QVS-${voltage}`

    circuits.push({
      id: `abt-${voltage}-${String(seq++).padStart(3, '0')}`,
      excelRow: rn,
      circuitRef,
      name: `${originId} → ${destId}`,
      originId,
      destinationId: destId,
      lineType,
      service,
      protectionName,
      protectionModel: str(row.AE),
      protectionCurrentA: num(row.AF),
      pnKW,
      pKWe,
      qKVAr,
      sKVA,
      ibA,
      voltage: String(voltage),
      parallelCables: parallel,
      cableSection: sectionOk ? cableSection : null,
      spare: !!spareFlag,
      virtual: !!isWinding,
      notes: notes
        ? notes
        : isWinding
          ? 'Devanado secundario banco TRF (fase)'
          : isSection
            ? 'Acoplador de sección LCS'
            : null,
    })
  }

  return { equipment: [...equipment.values()], circuits, nextId: seq }
}

const s440 = parseSheet(`${base}/worksheets/sheet2.xml`)
const hdr = s440.get(10)
console.log(
  '440 headers Y-Z etc',
  Object.entries(hdr || {})
    .filter(([c]) => c >= 'V' && c <= 'AE')
    .map(([c, v]) => `${c}=${v}`)
    .join(' | '),
)

const localMap = buildLocalMap()
console.log('LCS local', localMap.get(LCS))

const r440 = extractVoltage(s440, '440', localMap, 301)
const r230 = extractVoltage(
  parseSheet(`${base}/worksheets/sheet3.xml`),
  '230',
  localMap,
  r440.nextId,
)

console.log('440 circuits', r440.circuits.length, 'eq', r440.equipment.length)
console.log('230 circuits', r230.circuits.length, 'eq', r230.equipment.length)
console.log(
  'sample 440',
  r440.circuits.slice(0, 10).map((c) => ({
    ref: c.circuitRef,
    prot: c.protectionName,
    dest: c.destinationId,
    virt: c.virtual,
    spare: c.spare,
    svc: c.service,
  })),
)

const data = JSON.parse(readFileSync(jsonPath, 'utf8'))

if (!data.chains.some((c) => c.loadCenterId === LCS)) {
  data.chains.push({
    abtId: ABT,
    transformerId: TRF,
    loadCenterId: LCS,
    transformerName: 'TRANSFORMADOR Nº4 690V/440V-230V',
    loadCenterName: 'CENTRO DE CARGA N-4',
    ratings: {
      kVA: '660 / 570 / 90',
      primaryV: '690',
      secondary440V: '440',
      secondary230V: '230',
    },
  })
}

data._comment =
  'Cadenas ABT-6PWS0001/0002/0003/0004 → TRF → LCS-4PWS0001/0002/0003/0004 desde Excel 440V/230V Power System. Devanados TRF virtuales; QVS-440/230 entradas.'

const haveEq = new Set(data.equipment.map((e) => e.id))
const haveCirc = new Set(data.circuits.map((c) => c.id))
const haveRef = new Set(
  data.circuits.map((c) => c.circuitRef).filter(Boolean),
)

const allEq = [...r440.equipment, ...r230.equipment]
for (const eq of allEq) {
  if (haveEq.has(eq.id)) {
    const existing = data.equipment.find((e) => e.id === eq.id)
    if (existing && !existing.local && eq.local) existing.local = eq.local
    continue
  }
  const clean = { ...eq }
  if (!clean.local) delete clean.local
  if (!clean.dcp10Id) delete clean.dcp10Id
  data.equipment.push(clean)
  haveEq.add(eq.id)
}

const allCirc = [...r440.circuits, ...r230.circuits]
for (const c of allCirc) {
  if (haveCirc.has(c.id)) continue
  if (c.circuitRef && haveRef.has(c.circuitRef)) continue
  data.circuits.push(c)
  haveCirc.add(c.id)
  if (c.circuitRef) haveRef.add(c.circuitRef)
}

/**
 * Si un destino ya tenía ORIGEN-PENDIENTE (NORM o ALT), el circuito nuevo
 * del LCS actualiza esa acometida y elimina el placeholder (máx. 2 feeds).
 */
function resolvePendingFeeds(newCircuits) {
  let removed = 0
  for (const neu of newCircuits) {
    if (neu.spare || neu.virtual) continue
    const dest = neu.destinationId
    if (!dest || dest.startsWith('BUS-') || dest.startsWith('LCS-')) continue
    const pendings = data.circuits.filter(
      (c) =>
        c.originId === 'ORIGEN-PENDIENTE' &&
        c.destinationId === dest &&
        !c.virtual,
    )
    if (pendings.length === 0) continue
    // Preferir el pendiente cuyo lineType coincide; si hay uno solo, usarlo.
    const match =
      pendings.find((p) => p.lineType === neu.lineType) ?? pendings[0]
    neu.lineType = match.lineType
    neu.notes = `Resuelve ${match.name || match.id} (${match.lineType})`
    data.circuits = data.circuits.filter((c) => c.id !== match.id)
    removed++
    console.log(
      'resolved pending',
      dest,
      '→',
      neu.circuitRef,
      neu.lineType,
    )
  }
  if (
    removed &&
    !data.circuits.some((c) => c.originId === 'ORIGEN-PENDIENTE')
  ) {
    data.equipment = data.equipment.filter((e) => e.id !== 'ORIGEN-PENDIENTE')
  }
  return removed
}

resolvePendingFeeds(allCirc)

writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
console.log('wrote', jsonPath)
console.log('chains', data.chains.map((c) => c.loadCenterId))
console.log(
  'LCS0004 circuits',
  data.circuits.filter(
    (c) =>
      c.originId === LCS ||
      c.destinationId === LCS ||
      c.originId === TRF,
  ).length,
)
