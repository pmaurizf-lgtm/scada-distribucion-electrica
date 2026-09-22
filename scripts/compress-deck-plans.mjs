#!/usr/bin/env node
/**
 * Comprime PNG de planos/ → public/deck-plans/*.jpg
 * y regenera src/data/deckPlans/manifest.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'planos')
const outDir = path.join(root, 'public', 'deck-plans')
const manifestPath = path.join(root, 'src', 'data', 'deckPlans', 'manifest.json')

const MAX_WIDTH = 4500
const JPEG_QUALITY = 75

/** Hoja origen (Por defecto-NNN) → id, fichero y etiqueta publicados */
const SHEET_META = {
  '000': {
    id: 'cubierta-principal',
    file: 'cubierta-principal.jpg',
    label: 'Cubierta principal',
  },
  '001': {
    id: 'cubierta-2',
    file: 'cubierta-2.jpg',
    label: 'Cubierta 2',
  },
  '003': {
    id: 'cubierta-3',
    file: 'cubierta-3.jpg',
    label: 'Cubierta 3',
  },
  '004': {
    id: 'cubierta-4',
    file: 'cubierta-4.jpg',
    label: 'Cubierta 4-Techo Tanques',
  },
  '005': {
    id: 'tanques',
    file: 'tanques.jpg',
    label: 'Tanques',
  },
  '006': {
    id: 'cubierta-01',
    file: 'cubierta-01.jpg',
    label: 'Cubierta 01',
  },
  '007': {
    id: 'cubierta-02',
    file: 'cubierta-02.jpg',
    label: 'Cubierta 02',
  },
  '008': {
    id: 'cubiertas-03-07',
    file: 'cubiertas-03-07.jpg',
    label: 'Cubiertas 03 a 07',
  },
  '009': {
    id: 'cubierta-08',
    file: 'cubierta-08.jpg',
    label: 'Cubierta 08 y vista trasversal',
  },
}

function sheetKeyFromName(name) {
  const m = name.match(/Por defecto-(\d{3})/i) || name.match(/-(\d{3})\s*-/)
  return m ? m[1] : null
}

async function main() {
  if (!fs.existsSync(srcDir)) {
    console.error('No existe planos/. Coloca ahí los PNG fuente.')
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })

  // Quitar JPEG antiguos numerados
  for (const f of fs.readdirSync(outDir)) {
    if (f.toLowerCase().endsWith('.jpg')) {
      fs.unlinkSync(path.join(outDir, f))
    }
  }

  const pngs = fs
    .readdirSync(srcDir)
    .filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('.'))
    .sort()

  if (pngs.length === 0) {
    console.error('No hay PNG en planos/')
    process.exit(1)
  }

  const plans = []
  const order = Object.keys(SHEET_META)

  for (const file of pngs) {
    const sheet = sheetKeyFromName(file)
    const meta = sheet ? SHEET_META[sheet] : null
    if (!meta) {
      console.warn(`Sin mapeo para ${file} (hoja ${sheet}) — omitido`)
      continue
    }
    const inPath = path.join(srcDir, file)
    const outPath = path.join(outDir, meta.file)
    const imgMeta = await sharp(inPath).metadata()
    const width = imgMeta.width ?? MAX_WIDTH
    const height = imgMeta.height ?? 1
    const scale = width > MAX_WIDTH ? MAX_WIDTH / width : 1
    const outW = Math.round(width * scale)
    const outH = Math.round(height * scale)

    await sharp(inPath)
      .resize({ width: outW, height: outH, fit: 'fill' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(outPath)

    const st = fs.statSync(outPath)
    console.log(
      `${file} → ${meta.file} (${outW}×${outH}, ${(st.size / 1024 / 1024).toFixed(2)} MiB)`,
    )
    plans.push({
      id: meta.id,
      file: meta.file,
      label: meta.label,
      width: outW,
      height: outH,
      sourceFile: file,
      sheet,
    })
  }

  plans.sort(
    (a, b) => order.indexOf(a.sheet) - order.indexOf(b.sheet),
  )
  for (const p of plans) delete p.sheet

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ version: 1, plans }, null, 2) + '\n',
  )
  console.log(`manifest → ${manifestPath} (${plans.length} planos)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
