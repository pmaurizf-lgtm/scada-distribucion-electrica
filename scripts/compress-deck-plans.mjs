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

function sheetIdFromName(name) {
  const m = name.match(/Por defecto-(\d{3})/i) || name.match(/-(\d{3})\s*-/)
  return m ? m[1] : name.replace(/\.[^.]+$/, '')
}

function labelFor(id) {
  return `Hoja ${id}`
}

async function main() {
  if (!fs.existsSync(srcDir)) {
    console.error('No existe planos/. Coloca ahí los PNG fuente.')
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })

  const pngs = fs
    .readdirSync(srcDir)
    .filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('.'))
    .sort()

  if (pngs.length === 0) {
    console.error('No hay PNG en planos/')
    process.exit(1)
  }

  const plans = []
  for (const file of pngs) {
    const id = sheetIdFromName(file)
    const outName = `${id}.jpg`
    const inPath = path.join(srcDir, file)
    const outPath = path.join(outDir, outName)
    const meta = await sharp(inPath).metadata()
    const width = meta.width ?? MAX_WIDTH
    const height = meta.height ?? 1
    const scale = width > MAX_WIDTH ? MAX_WIDTH / width : 1
    const outW = Math.round(width * scale)
    const outH = Math.round(height * scale)

    await sharp(inPath)
      .resize({ width: outW, height: outH, fit: 'fill' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(outPath)

    const st = fs.statSync(outPath)
    console.log(
      `${file} → ${outName} (${outW}×${outH}, ${(st.size / 1024 / 1024).toFixed(2)} MiB)`,
    )
    plans.push({
      id,
      file: outName,
      label: labelFor(id),
      width: outW,
      height: outH,
      sourceFile: file,
    })
  }

  plans.sort((a, b) => a.id.localeCompare(b.id))
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
