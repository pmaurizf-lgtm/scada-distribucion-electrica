import manifestJson from '../data/deckPlans/manifest.json'
import hitsJson from '../data/deckPlans/hits.json'
import overridesJson from '../data/deckPlans/overrides.json'
import { localLookupKeys, normalizeLocalCode } from './normalize'
import type {
  DeckPlanHit,
  DeckPlanHitsFile,
  DeckPlanManifest,
  DeckPlanMeta,
} from './types'

export type { DeckPlanHit, DeckPlanMeta, DeckPlanManifest, DeckPlanHitsFile }
export { normalizeLocalCode, localLookupKeys } from './normalize'
export {
  requestOpenDeckPlan,
  SCADA_OPEN_DECK_PLAN_EVENT,
  type OpenDeckPlanDetail,
} from './openDeckPlanEvent'

const STORAGE_KEY = 'scada-deck-plan-overrides-v1'

const manifest = manifestJson as DeckPlanManifest
const hitsFile = hitsJson as DeckPlanHitsFile
const committedOverrides = overridesJson as DeckPlanHitsFile

export function listDeckPlans(): DeckPlanMeta[] {
  return manifest.plans ?? []
}

export function getDeckPlan(planId: string): DeckPlanMeta | undefined {
  return listDeckPlans().find((p) => p.id === planId)
}

/** URL relativa al base de Vite (public/). */
export function deckPlanImageUrl(plan: DeckPlanMeta): string {
  return `./deck-plans/${plan.file}`
}

function readLocalOverrides(): Record<string, DeckPlanHit[]> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DeckPlanHitsFile
    return parsed.locals ?? {}
  } catch {
    return {}
  }
}

function writeLocalOverrides(locals: Record<string, DeckPlanHit[]>): void {
  if (typeof localStorage === 'undefined') return
  const payload: DeckPlanHitsFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    locals,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/** Merge: OCR < overrides.json < localStorage (más reciente gana por planId). */
export function hitsForLocal(rawLocal: string | null | undefined): DeckPlanHit[] {
  const keys = localLookupKeys(rawLocal)
  if (keys.length === 0) return []

  const byPlan = new Map<string, DeckPlanHit>()

  const absorb = (locals: Record<string, DeckPlanHit[]> | undefined) => {
    if (!locals) return
    for (const key of keys) {
      const list = locals[key]
      if (!list) continue
      for (const h of list) {
        byPlan.set(h.planId, { ...h })
      }
    }
  }

  absorb(hitsFile.locals)
  absorb(committedOverrides.locals)
  absorb(readLocalOverrides())

  return [...byPlan.values()].sort((a, b) => a.planId.localeCompare(b.planId))
}

export function hasDeckPlanHits(rawLocal: string | null | undefined): boolean {
  return hitsForLocal(rawLocal).length > 0
}

/**
 * Sustituye/añade un hit para el local en el plan indicado (localStorage).
 */
export function saveLocalOverrideHit(
  rawLocal: string,
  hit: DeckPlanHit,
): void {
  const norm = normalizeLocalCode(rawLocal)
  if (!norm) return
  const locals = { ...readLocalOverrides() }
  const list = [...(locals[norm] ?? [])]
  const i = list.findIndex((h) => h.planId === hit.planId)
  if (i >= 0) list[i] = hit
  else list.push(hit)
  list.sort((a, b) => a.planId.localeCompare(b.planId))
  locals[norm] = list
  writeLocalOverrides(locals)
}

/** JSON listo para pegar en overrides.json (merge con committed). */
export function exportOverridesJson(): string {
  const local = readLocalOverrides()
  const merged: Record<string, DeckPlanHit[]> = {
    ...(committedOverrides.locals ?? {}),
  }
  for (const [k, list] of Object.entries(local)) {
    const byPlan = new Map<string, DeckPlanHit>()
    for (const h of merged[k] ?? []) byPlan.set(h.planId, h)
    for (const h of list) byPlan.set(h.planId, h)
    merged[k] = [...byPlan.values()].sort((a, b) =>
      a.planId.localeCompare(b.planId),
    )
  }
  return JSON.stringify({ version: 1, locals: merged }, null, 2) + '\n'
}

export { STORAGE_KEY }
