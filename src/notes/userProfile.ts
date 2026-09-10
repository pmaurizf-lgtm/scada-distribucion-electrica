const PROFILE_KEY = 'scada-user-profile-v1'
const INSTALL_ID_KEY = 'scada-install-id-v1'

export type UserProfile = {
  v: 1 | 2
  displayName: string
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Id estable de este móvil (no cambia al editar el nombre). */
export function getInstallUserId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY)?.trim()
    if (existing) return existing
    const id = newId()
    localStorage.setItem(INSTALL_ID_KEY, id)
    return id
  } catch {
    return newId()
  }
}

export function loadUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserProfile
    if ((parsed?.v !== 1 && parsed?.v !== 2) || typeof parsed.displayName !== 'string') {
      return null
    }
    const name = parsed.displayName.trim()
    if (!name) return null
    return { v: parsed.v, displayName: name }
  } catch {
    return null
  }
}

export function saveUserProfile(displayName: string): UserProfile {
  getInstallUserId()
  const profile: UserProfile = {
    v: 2,
    displayName: displayName.trim(),
  }
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* cuota / privado */
  }
  return profile
}

export function hasDisplayName(): boolean {
  return loadUserProfile() != null
}
