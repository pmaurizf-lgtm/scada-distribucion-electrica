#!/usr/bin/env node
/**
 * OCR de public/deck-plans/*.jpg → src/data/deckPlans/hits.json
 * CAD blanco/negro: invierte; usa TSV/blocks de tesseract.js v7.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorker, PSM } from 'tesseract.js'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const plansDir = path.join(root, 'public', 'deck-plans')
const manifestPath = path.join(root, 'src', 'data', 'deckPlans', 'manifest.json')
const hitsPath = path.join(root, 'src', 'data', 'deckPlans', 'hits.json')

function normalizeCode(raw) {
  let s = String(raw)
    .toUpperCase()
    .replace(/[–—.=:_]/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
  const m = s.match(/^([I1L0])-(\d{2,3})-(\d)-([A-Z0-9])$/)
  if (!m) return null
  let a = m[1]
  if (a === 'I' || a === 'L') a = '1'
  if (a === 'O') a = '0'
  if (a === '0') return null
  return `${a}-${m[2]}-${m[3]}-${m[4]}`
}

/** Une fragmentos OCR: "1-143" + "6-Q" → código */
function tryJoin(parts) {
  const joined = parts.join('').replace(/\s+/g, '')
  return normalizeCode(joined) || normalizeCode(parts.join('-'))
}

function parseTsvWords(tsv, scale) {
  const out = []
  for (const line of String(tsv || '').split('\n')) {
    const cols = line.split('\t')
    if (cols.length < 12) continue
    if (Number(cols[0]) !== 5) continue
    const text = (cols[11] || '').trim()
    if (!text) continue
    const left = Number(cols[6])
    const top = Number(cols[7])
    const width = Number(cols[8])
    const height = Number(cols[9])
    const conf = Number(cols[10])
    if (![left, top, width, height].every(Number.isFinite)) continue
    out.push({
      text,
      x0: left / scale,
      y0: top / scale,
      x1: (left + width) / scale,
      y1: (top + height) / scale,
      conf: Number.isFinite(conf) ? conf : 40,
    })
  }
  return out
}

function wordsFromBlocks(blocks, scale) {
  const out = []
  for (const b of blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const line of p.lines || []) {
        for (const w of line.words || []) {
          const bb = w.bbox
          if (!bb || !w.text) continue
          out.push({
            text: String(w.text).trim(),
            x0: bb.x0 / scale,
            y0: bb.y0 / scale,
            x1: bb.x1 / scale,
            y1: bb.y1 / scale,
            conf: typeof w.confidence === 'number' ? w.confidence : 40,
          })
        }
      }
    }
  }
  return out
}

function collectHits(words, planId) {
  /** @type {Map<string, { local: string, planId: string, x: number, y: number, w: number, h: number, conf: number }>} */
  const best = new Map()

  const add = (local, x0, y0, x1, y1, conf) => {
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const ww = Math.max(70, (x1 - x0) * 1.5)
    const hh = Math.max(40, (y1 - y0) * 3)
    const prev = best.get(local)
    if (!prev || conf > prev.conf) {
      best.set(local, {
        local,
        planId,
        x: Math.round(cx),
        y: Math.round(cy),
        w: Math.round(ww),
        h: Math.round(hh),
        conf: Math.round(conf),
      })
    }
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const alone = normalizeCode(w.text)
    if (alone) {
      add(alone, w.x0, w.y0, w.x1, w.y1, w.conf)
      continue
    }
    for (let n = 2; n <= 5; n++) {
      const slice = words.slice(i, i + n)
      if (slice.length < n) break
      // Misma línea aprox.
      const sameRow = slice.every(
        (s) => Math.abs(s.y0 - w.y0) < Math.max(14, (w.y1 - w.y0) * 1.2),
      )
      if (!sameRow) break
      const local = tryJoin(slice.map((s) => s.text))
      if (!local) continue
      add(
        local,
        Math.min(...slice.map((s) => s.x0)),
        Math.min(...slice.map((s) => s.y0)),
        Math.max(...slice.map((s) => s.x1)),
        Math.max(...slice.map((s) => s.y1)),
        Math.min(...slice.map((s) => s.conf)),
      )
    }
  }
  return [...best.values()]
}

async function ocrPlan(worker, plan) {
  const imgPath = path.join(plansDir, plan.file)
  if (!fs.existsSync(imgPath)) return []

  const ocrMaxW = 3600
  const scale = plan.width > ocrMaxW ? ocrMaxW / plan.width : 1
  const outW = Math.round(plan.width * scale)
  const outH = Math.round(plan.height * scale)

  const buf = await sharp(imgPath)
    .resize({ width: outW, height: outH, fit: 'fill' })
    .greyscale()
    .negate()
    .normalize()
    .sharpen()
    .png()
    .toBuffer()

  console.log(`OCR ${plan.id} (${outW}×${outH})…`)
  await worker.setParameters({
    tessedit_pageseg_mode: String(PSM.SPARSE_TEXT),
    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ- ',
  })
  const { data } = await worker.recognize(
    buf,
    {},
    { text: true, blocks: true, tsv: true },
  )

  const words = [
    ...parseTsvWords(data.tsv, scale),
    ...wordsFromBlocks(data.blocks, scale),
  ]
  console.log(`  tokens=${words.length}`)
  return collectHits(words, plan.id)
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('Falta manifest.json — ejecuta: npm run deck-plans:compress')
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const worker = await createWorker('eng')
  /** @type {Record<string, Array<{ planId: string, x: number, y: number, w?: number, h?: number, conf?: number }>>} */
  const byLocal = {}

  try {
    for (const plan of manifest.plans) {
      const hits = await ocrPlan(worker, plan)
      console.log(`  → ${hits.length} códigos`)
      for (const { local, ...rest } of hits) {
        if (!byLocal[local]) byLocal[local] = []
        if (!byLocal[local].some((h) => h.planId === rest.planId)) {
          byLocal[local].push(rest)
        }
      }
    }
  } finally {
    await worker.terminate()
  }

  for (const list of Object.values(byLocal)) {
    list.sort((a, b) => a.planId.localeCompare(b.planId))
  }

  fs.writeFileSync(
    hitsPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        locals: byLocal,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`hits → ${hitsPath} (${Object.keys(byLocal).length} locales)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
