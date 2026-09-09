const PROFILE_KEY = 'scada-user-profile-v1'

export type UserProfile = {
  v: 1
  displayName: string
}

export function loadUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserProfile
    if (parsed?.v !== 1 || typeof parsed.displayName !== 'string') return null
    const name = parsed.displayName.trim()
    if (!name) return null
    return { v: 1, displayName: name }
  } catch {
    return null
  }
}

export function saveUserProfile(displayName: string): UserProfile {
  const profile: UserProfile = {
    v: 1,
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
