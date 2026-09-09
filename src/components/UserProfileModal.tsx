import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useUserProfile } from '../notes/UserProfileContext'
import { useIsMobileUi } from '../hooks/useIsMobileUi'

type UserProfileModalProps = {
  /** Si true, no se puede cerrar sin guardar nombre. */
  required?: boolean
}

export function UserProfileModal({ required = false }: UserProfileModalProps) {
  const {
    displayName,
    setDisplayName,
    profilePromptOpen,
    closeProfilePrompt,
    profilePromptReason,
  } = useUserProfile()
  const isMobile = useIsMobileUi()
  const [value, setValue] = useState(displayName)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profilePromptOpen) {
      setValue(displayName)
      setError(null)
    }
  }, [profilePromptOpen, displayName])

  if (!profilePromptOpen || typeof document === 'undefined') return null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('El nombre no puede estar vacío.')
      return
    }
    if (trimmed.length > 80) {
      setError('Máximo 80 caracteres.')
      return
    }
    setDisplayName(trimmed)
  }

  return createPortal(
    <div
      className={`notes-modal-backdrop${isMobile ? ' notes-modal-backdrop--mobile' : ''}`}
      role="presentation"
      onClick={() => {
        if (!required) closeProfilePrompt()
      }}
    >
      <div
        className={`notes-modal notes-modal--profile${isMobile ? ' notes-modal--mobile' : ''}`}
        role="dialog"
        aria-labelledby="user-profile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="notes-modal__header">
          <div>
            <p className="notes-modal__kicker">Instalación</p>
            <h2 id="user-profile-title" className="notes-modal__title">
              Nombre de usuario
            </h2>
          </div>
          {!required && (
            <button
              type="button"
              className="notes-modal__close"
              aria-label="Cerrar"
              onClick={closeProfilePrompt}
            >
              ×
            </button>
          )}
        </header>
        {profilePromptReason && (
          <p className="notes-modal__hint">{profilePromptReason}</p>
        )}
        <form className="notes-modal__form" onSubmit={onSubmit}>
          <label className="notes-modal__label" htmlFor="user-display-name">
            Tu nombre (se asignará a las notas)
          </label>
          <input
            id="user-display-name"
            className="notes-modal__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="name"
            maxLength={80}
            placeholder="Ej. Pablo Mouriz"
          />
          {error && <p className="notes-modal__error">{error}</p>}
          <div className="notes-modal__actions">
            {!required && (
              <button
                type="button"
                className="btn"
                onClick={closeProfilePrompt}
              >
                Cancelar
              </button>
            )}
            <button type="submit" className="btn btn--active">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
