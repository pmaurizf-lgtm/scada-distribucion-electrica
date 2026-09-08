import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const EXPORT_CLASS = 'stree--export'

type PageFormat = 'a3' | 'a4'
type PageOrientation = 'landscape' | 'portrait'

const PAGE_MM: Record<
  PageFormat,
  Record<PageOrientation, [number, number]>
> = {
  a3: { landscape: [420, 297], portrait: [297, 420] },
  a4: { landscape: [297, 210], portrait: [210, 297] },
}

const MARGIN_MM = 10

function slug(id: string): string {
  return (
    id
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 48) || 'arbol'
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
        return a != null
          ? `rgba(${ri}, ${gi}, ${bi}, ${a})`
          : `rgb(${ri}, ${gi}, ${bi})`
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
  background: string,
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
      background,
    )
    try {
      const canvas = await html2canvas(clone, {
        scale,
        backgroundColor: background,
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
        throw new Error('La captura del árbol salió vacía.')
      }
      return canvas
    } finally {
      dispose()
    }
  } finally {
    restore.forEach((fn) => fn())
  }
}

/** Elige A3/A4 y vertical/horizontal maximizando la escala al caber en una página. */
export function chooseBestPage(
  contentW: number,
  contentH: number,
): { format: PageFormat; orientation: PageOrientation } {
  const options: Array<{
    format: PageFormat
    orientation: PageOrientation
  }> = [
    { format: 'a4', orientation: 'portrait' },
    { format: 'a4', orientation: 'landscape' },
    { format: 'a3', orientation: 'portrait' },
    { format: 'a3', orientation: 'landscape' },
  ]

  let best = options[0]
  let bestScale = -1
  for (const opt of options) {
    const [pw, ph] = PAGE_MM[opt.format][opt.orientation]
    const maxW = pw - MARGIN_MM * 2
    const maxH = ph - MARGIN_MM * 2
    const scale = Math.min(maxW / contentW, maxH / contentH)
    if (scale > bestScale) {
      bestScale = scale
      best = opt
    }
  }
  return best
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

export interface SearchTreePdfResult {
  format: PageFormat
  orientation: PageOrientation
}

/**
 * PDF del árbol de alimentaciones (fondo blanco).
 * Formato A3/A4 y orientación se eligen para maximizar el tamaño del gráfico.
 */
export async function exportSearchTreePdf(
  treeEl: HTMLElement,
  equipmentId: string,
): Promise<SearchTreePdfResult> {
  treeEl.classList.add(EXPORT_CLASS)
  let canvas: HTMLCanvasElement
  try {
    canvas = await capture(treeEl, '#ffffff')
  } finally {
    treeEl.classList.remove(EXPORT_CLASS)
  }

  // Relación de aspecto del contenido (px); mm equivalentes proporcionales
  const { format, orientation } = chooseBestPage(canvas.width, canvas.height)
  const [pageW, pageH] = PAGE_MM[format][orientation]
  const maxW = pageW - MARGIN_MM * 2
  const maxH = pageH - MARGIN_MM * 2
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height)
  const drawW = canvas.width * scale
  const drawH = canvas.height * scale
  const x = MARGIN_MM + (maxW - drawW) / 2
  const y = MARGIN_MM + (maxH - drawH) / 2

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format,
  })
  pdf.addImage(
    canvas.toDataURL('image/jpeg', 0.92),
    'JPEG',
    x,
    y,
    drawW,
    drawH,
  )
  downloadPdf(pdf, `arbol-alimentaciones-${slug(equipmentId)}.pdf`)

  return { format, orientation }
}
