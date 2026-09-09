import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { chooseBestPage } from '../utils/exportSearchTreePdf'
import type { StartupReport } from './types'

const TREE_EXPORT_CLASS = 'startup-trees--export'
const MARGIN_MM = 8

function slug(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 48) || 'puesta-en-marcha'
  )
}

function sanitizeCssValue(value: string): string {
  return value
    .replace(
      /color\s*\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/gi,
      (_, r, g, b, a) => {
        const ri = Math.round(parseFloat(r) * 255)
        const gi = Math.round(parseFloat(g) * 255)
        const bi = Math.round(parseFloat(b) * 255)
        return a != null ? `rgba(${ri}, ${gi}, ${bi}, ${a})` : `rgb(${ri}, ${gi}, ${bi})`
      },
    )
    .replace(/color-mix\([^)]+\)/gi, 'transparent')
}

function inlineComputedStyles(source: Element, target: Element): void {
  const sources = [source, ...source.querySelectorAll('*')]
  const targets = [target, ...target.querySelectorAll('*')]
  const n = Math.min(sources.length, targets.length)
  for (let i = 0; i < n; i++) {
    const src = sources[i]
    const dst = targets[i]
    if (!(src instanceof HTMLElement) || !(dst instanceof HTMLElement)) continue
    const computed = getComputedStyle(src)
    for (let j = 0; j < computed.length; j++) {
      const prop = computed.item(j)
      if (!prop) continue
      const value = sanitizeCssValue(computed.getPropertyValue(prop))
      if (value) dst.style.setProperty(prop, value)
    }
  }
}

function mountCaptureClone(
  source: HTMLElement,
  background: string,
): {
  clone: HTMLElement
  width: number
  height: number
  dispose: () => void
} {
  const width = Math.max(source.scrollWidth, source.offsetWidth, 1)
  const height = Math.max(source.scrollHeight, source.offsetHeight, 1)

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'border:0',
    'visibility:hidden',
    `width:${width}px`,
    `height:${height}px`,
  ].join(';')
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (!doc) throw new Error('No se pudo preparar la captura PDF.')
  doc.open()
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:${background};width:${width}px;min-height:${height}px;overflow:visible"></body></html>`,
  )
  doc.close()

  const clone = source.cloneNode(true) as HTMLElement
  clone.style.overflow = 'visible'
  clone.style.height = 'auto'
  clone.style.maxHeight = 'none'
  clone.style.width = `${width}px`
  inlineComputedStyles(source, clone)
  doc.body.appendChild(clone)

  const captureW = Math.max(clone.scrollWidth, clone.offsetWidth, width)
  const captureH = Math.max(clone.scrollHeight, clone.offsetHeight, height)
  frame.style.width = `${captureW}px`
  frame.style.height = `${captureH}px`

  return {
    clone,
    width: captureW,
    height: captureH,
    dispose: () => frame.remove(),
  }
}

async function capture(
  source: HTMLElement,
  options: { background: string },
): Promise<HTMLCanvasElement> {
  const restore: Array<() => void> = []
  for (let node: HTMLElement | null = source; node; node = node.parentElement) {
    const el = node
    const prev = {
      overflow: el.style.overflow,
      maxHeight: el.style.maxHeight,
      height: el.style.height,
    }
    el.style.overflow = 'visible'
    el.style.maxHeight = 'none'
    restore.push(() => {
      el.style.overflow = prev.overflow
      el.style.maxHeight = prev.maxHeight
      el.style.height = prev.height
    })
  }
  source.style.height = 'auto'

  try {
    const contentH = Math.max(source.scrollHeight, source.offsetHeight)
    let scale = 2
    const maxDim = 24000
    if (contentH * scale > maxDim) scale = Math.max(1, maxDim / contentH)

    const { clone, width, height, dispose } = mountCaptureClone(
      source,
      options.background,
    )
    try {
      const canvas = await html2canvas(clone, {
        scale,
        backgroundColor: options.background,
        logging: false,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
      })
      if (canvas.width < 1 || canvas.height < 1) {
        throw new Error('La captura del informe salió vacía.')
      }
      return canvas
    } finally {
      dispose()
    }
  } finally {
    restore.forEach((fn) => fn())
  }
}

type PageFormat = 'a3' | 'a4'
type PageOrientation = 'landscape' | 'portrait'

const PAGE_MM: Record<
  PageFormat,
  Record<PageOrientation, [number, number]>
> = {
  a3: { landscape: [420, 297], portrait: [297, 420] },
  a4: { landscape: [297, 210], portrait: [210, 297] },
}

interface PdfLayout {
  pdf: jsPDF
  format: PageFormat
  orientation: PageOrientation
  margin: number
  maxW: number
  maxH: number
  y: number
}

function createLayout(
  pdf: jsPDF,
  format: PageFormat,
  orientation: PageOrientation,
  margin: number,
): PdfLayout {
  const [, pageH] = PAGE_MM[format][orientation]
  return {
    pdf,
    format,
    orientation,
    margin,
    maxW: PAGE_MM[format][orientation][0] - margin * 2,
    maxH: pageH - margin * 2,
    y: margin,
  }
}

function newPage(layout: PdfLayout): void {
  layout.pdf.addPage(layout.format, layout.orientation)
  layout.y = layout.margin
}

function drawSlice(
  layout: PdfLayout,
  canvas: HTMLCanvasElement,
  srcY: number,
  sliceH: number,
): void {
  if (sliceH <= 0 || !Number.isFinite(sliceH)) return
  const scale = layout.maxW / canvas.width
  const drawH = sliceH * scale

  const slice = document.createElement('canvas')
  slice.width = canvas.width
  slice.height = Math.ceil(sliceH)
  const ctx = slice.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, slice.width, slice.height)
  ctx.drawImage(
    canvas,
    0,
    srcY,
    canvas.width,
    sliceH,
    0,
    0,
    canvas.width,
    sliceH,
  )

  layout.pdf.addImage(
    slice.toDataURL('image/jpeg', 0.92),
    'JPEG',
    layout.margin,
    layout.y,
    layout.maxW,
    drawH,
  )
  layout.y += drawH
}

/** Tabla: pagina a ancho completo (sin cortar filas a mitad si el alto cabe). */
function appendTableCanvas(layout: PdfLayout, canvas: HTMLCanvasElement): void {
  const pageBottom = layout.margin + layout.maxH
  const scale = layout.maxW / canvas.width
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('No se pudo calcular el tamaño del PDF.')
  }

  let srcY = 0
  let guard = 0
  while (srcY < canvas.height - 0.5 && guard < 500) {
    guard++
    const remainingMm = pageBottom - layout.y
    if (remainingMm <= 3) {
      newPage(layout)
      continue
    }

    const maxSlicePx = remainingMm / scale
    let sliceH = Math.min(canvas.height - srcY, maxSlicePx)
    if (sliceH <= 0.5) {
      newPage(layout)
      continue
    }

    drawSlice(layout, canvas, srcY, sliceH)
    srcY += sliceH

    if (srcY < canvas.height - 0.5) {
      newPage(layout)
    }
  }
}

/** Un árbol por página: elige A3/A4 y escala para caber sin cortar. */
function addTreeFitPage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  format: PageFormat,
  orientation: PageOrientation,
  header?: string,
): void {
  const [pageW, pageH] = PAGE_MM[format][orientation]
  let top = MARGIN_MM

  if (header?.trim()) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(13, 71, 161)
    pdf.text(header.trim(), MARGIN_MM, top + 4, {
      maxWidth: pageW - MARGIN_MM * 2,
    })
    top += 10
  }

  const maxW = pageW - MARGIN_MM * 2
  const maxH = pageH - top - MARGIN_MM
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height)
  const drawW = canvas.width * scale
  const drawH = canvas.height * scale
  const x = MARGIN_MM + (maxW - drawW) / 2
  const y = top + (maxH - drawH) / 2

  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.92),
    'JPEG',
    x,
    y,
    drawW,
    drawH,
  )
}

function downloadPdf(pdf: jsPDF, filename: string): void {
  const blob = pdf.output('blob')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * PDF del informe: un árbol (origen) por página, escalado para caber entero +
 * tabla resumen en A4 apaisado.
 */
export async function exportStartupPdf(
  report: StartupReport,
  treeEl: HTMLElement,
  tableEl: HTMLElement,
): Promise<void> {
  const groups = [
    ...treeEl.querySelectorAll<HTMLElement>('.startup-trees__group'),
  ]
  if (!groups.length) {
    throw new Error('No hay árboles de alimentaciones para exportar.')
  }

  treeEl.classList.add(TREE_EXPORT_CLASS)
  let pdf: jsPDF | null = null
  try {
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!
      const canvas = await capture(group, { background: '#ffffff' })
      const { format, orientation } = chooseBestPage(
        canvas.width,
        canvas.height,
      )
      const header =
        i === 0
          ? report.title
          : `${report.title} · ${i + 1}/${groups.length}`

      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: 'mm', format })
      } else {
        pdf.addPage(format, orientation)
      }
      addTreeFitPage(pdf, canvas, format, orientation, header)
    }
  } finally {
    treeEl.classList.remove(TREE_EXPORT_CLASS)
  }

  if (!pdf) {
    throw new Error('No se pudo generar el PDF de árboles.')
  }

  const tableCanvas = await capture(tableEl, { background: '#ffffff' })
  const tableLayout = createLayout(pdf, 'a4', 'landscape', MARGIN_MM)
  newPage(tableLayout)
  appendTableCanvas(tableLayout, tableCanvas)

  downloadPdf(pdf, `informe-puesta-en-marcha-${slug(report.title)}.pdf`)
}
