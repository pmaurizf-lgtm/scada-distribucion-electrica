/** Normalización y variantes OCR de códigos de local (p. ej. 1-143-6-Q). */

const CODE_RE = /^([0-9IL])-(\d{2,3})-(\d)-([A-Z0-9])$/i

export function normalizeLocalCode(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  let s = raw
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
  // Si viene "1-143-6-Q LOCAL …" quedarse con el código
  const head = s.match(/^([0-9IL]-\d{2,3}-\d-[A-Z0-9])/i)
  if (head) s = head[1]!.toUpperCase()

  const m = CODE_RE.exec(s)
  if (!m) return null
  let a = m[1]!.toUpperCase()
  if (a === 'I' || a === 'L') a = '1'
  const b = m[2]!.replace(/O/gi, '0')
  const c = m[3]!.replace(/O/gi, '0')
  const d = m[4]!.toUpperCase()
  return `${a}-${b}-${c}-${d}`
}

/** Variantes a probar en el índice (1↔I en el deck). */
export function localLookupKeys(raw: string | null | undefined): string[] {
  const norm = normalizeLocalCode(raw)
  if (!norm) return []
  const keys = new Set<string>([norm])
  const parts = norm.split('-')
  if (parts[0] === '1') {
    keys.add(`I-${parts[1]}-${parts[2]}-${parts[3]}`)
  }
  return [...keys]
}
