/**
 * 1) Rellena equipment.local faltante desde la lista de circuitos (cols origen/destino Local).
 * 2) Cruza LOCAL (A) ↔ DENOMINACION (B) de Lista de Compartimentos y escribe localName.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SRC_DIR = 'C:/Users/pmouriz/Documents/Archivos fuente APP Distribución'
const ABT_PATH = 'C:/Users/pmouriz/scada-distribucion-electrica/src/data/abtDownstream.json'
const SYS_PATH = 'C:/Users/pmouriz/scada-distribucion-electrica/src/data/system690.json'
const DENOM_OUT =
  'C:/Users/pmouriz/scada-distribucion-electrica/src/data/localDenominations.json'

function findSrc(pred) {
  const name = readdirSync(SRC_DIR).find(pred)
  if (!name) throw new Error(`No encontrado en ${SRC_DIR}: ${pred}`)
  return join(SRC_DIR, name)
}

function cellStr(v) {
  if (v == null) return null
  if (typeof v === 'number' && Number.isNaN(v)) return null
  const s = String(v).trim()
  if (!s || s === 'NaN' || s === '#N/A' || s === 'undefined') return null
  return s
}

/** Primer token (mismo criterio VLOOKUP / Main Equipment Report). */
function localToken(raw) {
  const s = cellStr(raw)
  if (!s) return null
  const sp = s.indexOf(' ')
  return sp > 0 ? s.slice(0, sp) : s
}

function isBadLocal(v) {
  return !cellStr(v)
}

/** Variantes de código de local (ceros a la izquierda en segmentos). */
function localVariants(loc) {
  const s = cellStr(loc)
  if (!s) return []
  const parts = s.split('-')
  const out = new Set([s])
  // pad / unpad primer segmento a 2 dígitos si es numérico
  if (/^\d+$/.test(parts[0])) {
    const n = String(Number(parts[0]))
    const p2 = parts[0].padStart(2, '0')
    out.add([n, ...parts.slice(1)].join('-'))
    out.add([p2, ...parts.slice(1)].join('-'))
  }
  // clave sin ceros a la izquierda en cada segmento numérico
  out.add(
    parts
      .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
      .join('-'),
  )
  return [...out]
}

function buildDenomMap(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const sh = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null })
  /** @type {Map<string, string>} */
  const byExact = new Map()
  /** @type {Map<string, string>} */
  const byNorm = new Map()
  for (let i = 1; i < rows.length; i++) {
    const loc = cellStr(rows[i]?.[0])
    const den = cellStr(rows[i]?.[1])
    if (!loc || !den) continue
    if (!byExact.has(loc)) byExact.set(loc, den)
    const norm = localVariants(loc).find((v) =>
      v.split('-').every((p, idx, arr) => {
        // norm key = unpadded numeric segments
        return true
      }),
    )
    const normKey = loc
      .split('-')
      .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
      .join('-')
    if (!byNorm.has(normKey)) byNorm.set(normKey, den)
  }
  return { byExact, byNorm }
}

function lookupDenom(map, loc) {
  const s = cellStr(loc)
  if (!s) return null
  if (map.byExact.has(s)) return map.byExact.get(s)
  for (const v of localVariants(s)) {
    if (map.byExact.has(v)) return map.byExact.get(v)
  }
  const normKey = s
    .split('-')
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
    .join('-')
  return map.byNorm.get(normKey) ?? null
}

function colLetterToIndex(letter) {
  let n = 0
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Extrae mapa PUMA → local desde hojas de potencia del xlsm de circuitos.
 * Columnas típicas: E origen PUMA, G origen Local, I destino PUMA, K destino Local.
 */
function rememberLocal(map, pumaRaw, locRaw) {
  const puma = cellStr(pumaRaw)
  const loc = localToken(locRaw)
  if (!puma || !loc) return
  if (!/^[A-Z]{2,}-/i.test(puma)) return
  if (!map.has(puma)) map.set(puma, loc)
}

function looksLikeLocal(v) {
  const s = cellStr(v)
  if (!s) return false
  // 2-117-2-E / 02-116-2-Q / 3-176-2-T
  return /^\d{1,2}-\d{1,3}(-\d{1,2})?-[A-Za-z]$/.test(s.split(/\s+/)[0])
}

function looksLikePuma(v) {
  const s = cellStr(v)
  return !!(s && /^[A-Z]{2,}-[A-Z0-9]+/i.test(s) && !looksLikeLocal(s))
}

function buildLocalByPumaFromCircuits(xlsmPath) {
  const wb = XLSX.readFile(xlsmPath, { cellFormula: false, raw: false })
  /** @type {Map<string, string>} */
  const localByPuma = new Map()

  const preferSheets = wb.SheetNames.filter((n) =>
    /440|230|115|400|24v|power|lighting|main equipment/i.test(n),
  )
  const sheets = preferSheets.length ? preferSheets : wb.SheetNames

  for (const name of sheets) {
    const sh = wb.Sheets[name]
    if (!sh) continue
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null })
    if (rows.length < 3) continue

    // Main Equipment Report: B=PUMA, H=Local (texto «código resto…»)
    if (/main equipment/i.test(name)) {
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] || []
        rememberLocal(localByPuma, row[1], row[7])
      }
      continue
    }

    // Detectar fila cabecera
    let headerRn = -1
    let cols = {
      originPuma: colLetterToIndex('E'),
      originLocal: colLetterToIndex('G'),
      destPuma: colLetterToIndex('I'),
      destLocal: colLetterToIndex('K'),
      destPumaAlt: colLetterToIndex('J'),
    }
    for (let r = 0; r < Math.min(25, rows.length); r++) {
      const vals = (rows[r] || []).map((v) =>
        v == null ? '' : String(v).trim().toLowerCase(),
      )
      const hasPuma = vals.some((v) => /puma/.test(v))
      const hasLocal = vals.some((v) => /local/.test(v))
      if (!hasPuma || !hasLocal) continue
      headerRn = r
      const find = (...preds) => {
        for (let c = 0; c < vals.length; c++) {
          if (preds.some((p) => p.test(vals[c]))) return c
        }
        return -1
      }
      const oP = find(/origen.*puma|puma.*origen/)
      const oL = find(/origen.*local|local.*origen/)
      const dP = find(/destino.*puma|puma.*destino|dest\.?\s*puma/)
      const dL = find(/destino.*local|local.*destino|dest\.?\s*local/)
      if (oP >= 0) cols.originPuma = oP
      if (oL >= 0) cols.originLocal = oL
      if (dP >= 0) cols.destPuma = dP
      if (dL >= 0) cols.destLocal = dL
      break
    }

    const start = headerRn >= 0 ? headerRn + 1 : 1
    for (let r = start; r < rows.length; r++) {
      const row = rows[r] || []
      rememberLocal(localByPuma, row[cols.originPuma], row[cols.originLocal])
      rememberLocal(localByPuma, row[cols.destPuma], row[cols.destLocal])
      // Algunas filas traen DCP en I y PUMA en J (p. ej. FFS-CIE*)
      rememberLocal(localByPuma, row[cols.destPumaAlt], row[cols.destLocal])

      // Barrido: cualquier PUMA con local en la celda siguiente
      for (let c = 0; c < row.length - 1; c++) {
        if (looksLikePuma(row[c]) && looksLikeLocal(row[c + 1])) {
          rememberLocal(localByPuma, row[c], row[c + 1])
        }
      }
    }
  }

  return localByPuma
}

function enrichFile(jsonPath, localByPuma, denomMap) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
  let filledLocal = 0
  let setDenom = 0
  let stillMissing = 0
  let trimmedIds = 0
  const missingIds = []

  for (const eq of data.equipment || []) {
    if (eq.spare) continue
    if (eq.id.startsWith('SPARE-') || eq.id.startsWith('BUS-')) continue

    // IDs Excel con espacio residual (p. ej. «MVP-IPMS1001 »)
    if (typeof eq.id === 'string' && eq.id !== eq.id.trim()) {
      eq.id = eq.id.trim()
      trimmedIds++
    }

    if (isBadLocal(eq.local)) {
      const fromExcel =
        localByPuma.get(eq.id) || localByPuma.get(eq.id.trim())
      if (fromExcel) {
        eq.local = fromExcel
        filledLocal++
      }
    }

    const den = lookupDenom(denomMap, eq.local)
    if (den) {
      if (eq.localName !== den) {
        eq.localName = den
        setDenom++
      }
    } else if (eq.localName) {
      delete eq.localName
    }

    if (isBadLocal(eq.local) && !eq.virtual) {
      stillMissing++
      if (missingIds.length < 40) missingIds.push(eq.id)
    }
  }

  // Alinear referencias de circuitos a IDs recortados
  for (const c of data.circuits || []) {
    if (typeof c.originId === 'string') c.originId = c.originId.trim()
    if (typeof c.destinationId === 'string')
      c.destinationId = c.destinationId.trim()
  }

  writeFileSync(jsonPath, JSON.stringify(data, null, 4) + '\n', 'utf8')
  return { filledLocal, setDenom, stillMissing, trimmedIds, missingIds }
}

const compartimentos = findSrc((n) => /COMPARTIMENTOS/i.test(n))
const circuitos = findSrc((n) => /lista_circuitos/i.test(n) || /circuitos_Rev/i.test(n))

console.log('Compartimentos:', compartimentos)
console.log('Circuitos:', circuitos)

const denomMap = buildDenomMap(compartimentos)
console.log('Denominaciones únicas:', denomMap.byExact.size)

const localByPuma = buildLocalByPumaFromCircuits(circuitos)
console.log('PUMA→local desde circuitos:', localByPuma.size)

const denomObj = Object.fromEntries(
  [...denomMap.byExact.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')),
)
writeFileSync(DENOM_OUT, JSON.stringify(denomObj, null, 2) + '\n', 'utf8')
console.log('Escrito', DENOM_OUT)

const abt = enrichFile(ABT_PATH, localByPuma, denomMap)
const sys = enrichFile(SYS_PATH, localByPuma, denomMap)
console.log('abtDownstream', abt)
console.log('system690', sys)
