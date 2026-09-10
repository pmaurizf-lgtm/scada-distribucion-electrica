import { initializeApp, getApps } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from 'firebase/auth'
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type { VesselId } from '../vessels/vesselCatalog'
import { coerceNoteLines, type InspectionNote, type NoteTarget } from './types'
import { getFirebaseWebConfig } from './syncConfig'

const APP_NAME = 'scada-notes'

let auth: Auth | null = null
let db: Firestore | null = null
let authReady: Promise<void> | null = null

function ensureFirebase(): { auth: Auth; db: Firestore } | null {
  const cfg = getFirebaseWebConfig()
  if (!cfg) return null
  const app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp(
      {
        apiKey: cfg.apiKey,
        authDomain: cfg.authDomain,
        projectId: cfg.projectId,
        appId: cfg.appId,
      },
      APP_NAME,
    )
  if (!auth) auth = getAuth(app)
  if (!db) {
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    } catch {
      db = getFirestore(app)
    }
  }
  return { auth, db }
}

export function ensureNotesAuth(): Promise<void> {
  const fb = ensureFirebase()
  if (!fb) return Promise.resolve()
  if (authReady) return authReady
  authReady = new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(fb.auth, (user) => {
      if (user) {
        unsub()
        resolve()
        return
      }
      signInAnonymously(fb.auth).then(() => {
        unsub()
        resolve()
      }).catch(reject)
    })
  })
  return authReady
}

function notesCol(vesselId: VesselId) {
  const fb = ensureFirebase()
  if (!fb) return null
  return collection(fb.db, 'vessels', vesselId, 'notes')
}

function stripUndef<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key]
  }
  return out
}

export function noteToFirestore(note: InspectionNote): Record<string, unknown> {
  return stripUndef({
    id: note.id,
    vesselId: note.vesselId,
    target: note.target,
    author: note.author,
    authorId: note.authorId,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt ?? null,
    lines: note.lines.map((l) =>
      stripUndef({
        id: l.id,
        text: l.text,
        resolved: l.resolved,
        resolvedAt: l.resolvedAt ?? null,
        resolvedBy: l.resolvedBy ?? null,
        resolvedById: l.resolvedById ?? null,
        resolvedUpdatedAt: l.resolvedUpdatedAt ?? null,
        textUpdatedAt: l.textUpdatedAt ?? null,
      }),
    ),
  })
}

function fromFirestore(raw: Record<string, unknown>, vesselId: VesselId): InspectionNote | null {
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.author !== 'string') return null
  if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') {
    return null
  }
  if (!raw.target || typeof raw.target !== 'object') return null
  const target = raw.target as NoteTarget
  if (target.kind === 'circuit') {
    if (typeof target.circuitId !== 'string') return null
  } else if (target.kind === 'equipment') {
    if (typeof target.equipmentId !== 'string') return null
  } else {
    return null
  }
  const deletedAt =
    typeof raw.deletedAt === 'string' && raw.deletedAt ? raw.deletedAt : undefined
  return {
    id: raw.id,
    vesselId,
    target,
    author: raw.author,
    authorId: typeof raw.authorId === 'string' ? raw.authorId : '',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deletedAt,
    lines: coerceNoteLines(raw.lines),
  }
}

export async function pullVesselNotes(
  vesselId: VesselId,
): Promise<InspectionNote[]> {
  const col = notesCol(vesselId)
  if (!col) return []
  await ensureNotesAuth()
  const snap = await getDocs(col)
  const out: InspectionNote[] = []
  snap.forEach((d) => {
    const n = fromFirestore(d.data() as Record<string, unknown>, vesselId)
    if (n) out.push(n)
  })
  return out
}

export async function pushVesselNote(note: InspectionNote): Promise<void> {
  const fb = ensureFirebase()
  if (!fb) return
  await ensureNotesAuth()
  const ref = doc(fb.db, 'vessels', note.vesselId, 'notes', note.id)
  await setDoc(ref, noteToFirestore(note), { merge: true })
}

export function subscribeVesselNotes(
  vesselId: VesselId,
  onChange: (notes: InspectionNote[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  const col = notesCol(vesselId)
  if (!col) return null
  return onSnapshot(
    col,
    (snap) => {
      const out: InspectionNote[] = []
      snap.forEach((d) => {
        const n = fromFirestore(d.data() as Record<string, unknown>, vesselId)
        if (n) out.push(n)
      })
      onChange(out)
    },
    (err) => onError?.(err),
  )
}
