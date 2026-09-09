import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { VesselId } from '../vessels/vesselCatalog'
import { kindLabelForNoteTarget, labelForNoteTarget } from './labels'
import { SCADA_OPEN_NOTES_EVENT } from './openNotesEvent'
import {
  buildNotesExport,
  countOpenNotesForTarget,
  createNoteId,
  loadVesselNotes,
  mergeImportedNotes,
  notesForTarget,
  saveVesselNotes,
} from './persistence'
import {
  coerceNoteLines,
  createLineId,
  normalizeNoteLinesFromText,
  type InspectionNote,
  type NoteLine,
  type NoteTarget,
} from './types'
import { loadUserProfile } from './userProfile'

export type NotesEditorSession = {
  target: NoteTarget
  noteId?: string | null
  createNew?: boolean
}

type NotesContextValue = {
  vesselId: VesselId
  notes: InspectionNote[]
  editor: NotesEditorSession | null
  openEditor: (session: NotesEditorSession) => void
  closeEditor: () => void
  openCountFor: (target: NoteTarget) => number
  notesFor: (target: NoteTarget) => InspectionNote[]
  createNote: (
    target: NoteTarget,
    lines: string | NoteLine[],
  ) => InspectionNote | null
  updateNote: (
    id: string,
    patch: { lines: NoteLine[] },
  ) => void
  setLineResolved: (
    noteId: string,
    lineId: string,
    resolved: boolean,
  ) => void
  deleteNote: (id: string) => void
  exportNotesJson: () => string
  importNotesJson: (raw: string) => {
    added: number
    updated: number
    skipped: number
  }
  labelFor: (target: NoteTarget) => string
  kindLabelFor: (target: NoteTarget) => string
}

const NotesContext = createContext<NotesContextValue | null>(null)

export function NotesProvider({
  vesselId,
  children,
}: {
  vesselId: VesselId
  children: ReactNode
}) {
  const [notes, setNotes] = useState<InspectionNote[]>(() =>
    loadVesselNotes(vesselId),
  )
  const [editor, setEditor] = useState<NotesEditorSession | null>(null)

  useEffect(() => {
    setNotes(loadVesselNotes(vesselId))
    setEditor(null)
  }, [vesselId])

  useEffect(() => {
    saveVesselNotes(vesselId, notes)
  }, [vesselId, notes])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<NoteTarget>).detail
      if (!detail || typeof detail !== 'object') return
      if (detail.kind === 'circuit' && typeof detail.circuitId === 'string') {
        setEditor({ target: detail })
        return
      }
      if (
        detail.kind === 'equipment' &&
        typeof detail.equipmentId === 'string'
      ) {
        setEditor({ target: detail })
      }
    }
    window.addEventListener(SCADA_OPEN_NOTES_EVENT, onOpen)
    return () => window.removeEventListener(SCADA_OPEN_NOTES_EVENT, onOpen)
  }, [])

  const openEditor = useCallback((session: NotesEditorSession) => {
    setEditor(session)
  }, [])

  const closeEditor = useCallback(() => setEditor(null), [])

  const openCountFor = useCallback(
    (target: NoteTarget) => countOpenNotesForTarget(notes, target),
    [notes],
  )

  const notesFor = useCallback(
    (target: NoteTarget) => notesForTarget(notes, target),
    [notes],
  )

  const createNote = useCallback(
    (target: NoteTarget, lines: string | NoteLine[]): InspectionNote | null => {
      const profile = loadUserProfile()
      if (!profile) return null
      const now = new Date().toISOString()
      const parsed =
        typeof lines === 'string'
          ? normalizeNoteLinesFromText(lines)
          : coerceNoteLines(lines)
      const note: InspectionNote = {
        id: createNoteId(),
        vesselId,
        target,
        author: profile.displayName,
        createdAt: now,
        updatedAt: now,
        lines:
          parsed.length > 0
            ? parsed
            : [{ id: createLineId(), text: '', resolved: false }],
      }
      // No guardar líneas vacías en create
      note.lines = note.lines.filter((l) => l.text.trim().length > 0)
      if (note.lines.length === 0) {
        note.lines = [{ id: createLineId(), text: '(sin texto)', resolved: false }]
      }
      setNotes((prev) => [note, ...prev])
      return note
    },
    [vesselId],
  )

  const updateNote = useCallback(
    (id: string, patch: { lines: NoteLine[] }) => {
      const now = new Date().toISOString()
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          const lines = coerceNoteLines(patch.lines).filter(
            (l) => l.text.trim().length > 0,
          )
          return { ...n, updatedAt: now, lines }
        }),
      )
    },
    [],
  )

  const setLineResolved = useCallback(
    (noteId: string, lineId: string, resolved: boolean) => {
      const now = new Date().toISOString()
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== noteId) return n
          return {
            ...n,
            updatedAt: now,
            lines: n.lines.map((l) =>
              l.id === lineId
                ? {
                    ...l,
                    resolved,
                    resolvedAt: resolved ? now : undefined,
                  }
                : l,
            ),
          }
        }),
      )
    },
    [],
  )

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const exportNotesJson = useCallback(() => {
    return JSON.stringify(buildNotesExport(vesselId, notes), null, 2)
  }, [vesselId, notes])

  const importNotesJson = useCallback(
    (raw: string) => {
      const parsed: unknown = JSON.parse(raw)
      const result = mergeImportedNotes(vesselId, notes, parsed)
      setNotes(result.notes)
      return {
        added: result.added,
        updated: result.updated,
        skipped: result.skipped,
      }
    },
    [vesselId, notes],
  )

  const value = useMemo<NotesContextValue>(
    () => ({
      vesselId,
      notes,
      editor,
      openEditor,
      closeEditor,
      openCountFor,
      notesFor,
      createNote,
      updateNote,
      setLineResolved,
      deleteNote,
      exportNotesJson,
      importNotesJson,
      labelFor: labelForNoteTarget,
      kindLabelFor: kindLabelForNoteTarget,
    }),
    [
      vesselId,
      notes,
      editor,
      openEditor,
      closeEditor,
      openCountFor,
      notesFor,
      createNote,
      updateNote,
      setLineResolved,
      deleteNote,
      exportNotesJson,
      importNotesJson,
    ],
  )

  return (
    <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
  )
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext)
  if (!ctx) {
    throw new Error('useNotes debe usarse dentro de NotesProvider')
  }
  return ctx
}

export function useNotesOptional(): NotesContextValue | null {
  return useContext(NotesContext)
}
