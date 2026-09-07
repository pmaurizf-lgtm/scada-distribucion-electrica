/** Persistencia local del layout geométrico (independiente de simPersistence). */
import type { LayoutDocument } from './types'
import { isLayoutDocument } from './types'

const STORAGE_KEY = 'scada-f110-geo-layout-v1'

export function loadGeoLayout(): LayoutDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isLayoutDocument(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveGeoLayout(doc: LayoutDocument): void {
  try {
    const payload: LayoutDocument = {
      ...doc,
      meta: {
        ...doc.meta,
        updatedAt: new Date().toISOString(),
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* cuota / privado */
  }
}

export function clearGeoLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function downloadGeoLayout(doc: LayoutDocument, filename?: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'unifilar-geometria.json'
  a.click()
  URL.revokeObjectURL(url)
}
