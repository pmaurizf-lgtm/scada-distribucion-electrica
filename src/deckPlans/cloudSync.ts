/**
 * Sync global de marcas de plano (todos los buques comparten la misma cubierta).
 * Doc: shared/deckPlanOverrides
 */
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebase, isSignedInUser, waitForAuthUser } from '../firebase/app'
import { isNotesSyncConfigured } from '../notes/syncConfig'
import type { DeckPlanHit, DeckPlanHitsFile } from './types'

export type DeckPlanOverridesCloud = {
  updatedAt: string
  locals: Record<string, DeckPlanHit[]>
}

const DOC_PATH = ['shared', 'deckPlanOverrides'] as const

export function isDeckPlanCloudConfigured(): boolean {
  return isNotesSyncConfigured()
}

async function ensureAuth(): Promise<void> {
  const user = await waitForAuthUser()
  if (!isSignedInUser(user)) throw new Error('Sesión no válida')
}

function overridesRef() {
  const fb = getFirebase()
  if (!fb) return null
  return doc(fb.db, DOC_PATH[0], DOC_PATH[1])
}

export async function pullDeckPlanOverrides(): Promise<DeckPlanOverridesCloud | null> {
  const ref = overridesRef()
  if (!ref) return null
  await ensureAuth()
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() as DeckPlanOverridesCloud
  return {
    updatedAt: data.updatedAt ?? '',
    locals: data.locals ?? {},
  }
}

export async function pushDeckPlanOverrides(
  payload: DeckPlanOverridesCloud,
): Promise<void> {
  const ref = overridesRef()
  if (!ref) return
  await ensureAuth()
  await setDoc(
    ref,
    {
      updatedAt: payload.updatedAt,
      locals: payload.locals,
    },
    { merge: false },
  )
}

export function subscribeDeckPlanOverrides(
  onChange: (data: DeckPlanOverridesCloud | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  const ref = overridesRef()
  if (!ref) return null
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null)
        return
      }
      const data = snap.data() as DeckPlanOverridesCloud
      onChange({
        updatedAt: data.updatedAt ?? '',
        locals: data.locals ?? {},
      })
    },
    (err) => onError?.(err),
  )
}

export function asHitsFile(
  cloud: DeckPlanOverridesCloud | null,
): DeckPlanHitsFile {
  return {
    version: 1,
    generatedAt: cloud?.updatedAt,
    locals: cloud?.locals ?? {},
  }
}
