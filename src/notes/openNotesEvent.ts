/** Puente por si el portal del globo no hereda contexto (fallback). */
import type { NoteTarget } from './types'

export const SCADA_OPEN_NOTES_EVENT = 'scada-open-notes'

export function requestOpenNotes(target: NoteTarget): void {
  window.dispatchEvent(
    new CustomEvent(SCADA_OPEN_NOTES_EVENT, { detail: target }),
  )
}
