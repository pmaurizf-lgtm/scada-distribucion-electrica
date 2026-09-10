import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getInstallUserId,
  loadUserProfile,
  saveUserProfile,
  type UserProfile,
} from './userProfile'

type UserProfileContextValue = {
  profile: UserProfile | null
  displayName: string
  setDisplayName: (name: string) => void
  ensureProfile: () => boolean
  profilePromptOpen: boolean
  openProfilePrompt: (reason?: string) => void
  closeProfilePrompt: () => void
  profilePromptReason: string | null
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    getInstallUserId()
    return loadUserProfile()
  })
  const [profilePromptOpen, setProfilePromptOpen] = useState(false)
  const [profilePromptReason, setProfilePromptReason] = useState<string | null>(
    null,
  )

  const setDisplayName = useCallback((name: string) => {
    const next = saveUserProfile(name)
    setProfile(next)
    setProfilePromptOpen(false)
    setProfilePromptReason(null)
  }, [])

  const ensureProfile = useCallback(() => {
    const current = loadUserProfile()
    if (current) {
      setProfile(current)
      return true
    }
    setProfilePromptReason('Indica tu nombre para firmar las notas de revisión.')
    setProfilePromptOpen(true)
    return false
  }, [])

  const openProfilePrompt = useCallback((reason?: string) => {
    setProfilePromptReason(reason ?? null)
    setProfilePromptOpen(true)
  }, [])

  const closeProfilePrompt = useCallback(() => {
    setProfilePromptOpen(false)
    setProfilePromptReason(null)
  }, [])

  const value = useMemo(
    () => ({
      profile,
      displayName: profile?.displayName ?? '',
      setDisplayName,
      ensureProfile,
      profilePromptOpen,
      openProfilePrompt,
      closeProfilePrompt,
      profilePromptReason,
    }),
    [
      profile,
      setDisplayName,
      ensureProfile,
      profilePromptOpen,
      openProfilePrompt,
      closeProfilePrompt,
      profilePromptReason,
    ],
  )

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext)
  if (!ctx) {
    throw new Error('useUserProfile debe usarse dentro de UserProfileProvider')
  }
  return ctx
}
