import { useEffect, useRef } from 'react'
import {
  adoptRemoteOverrides,
  getLocalOverridesSnapshot,
  publishLocalOverridesToCloud,
  SCADA_DECK_PLAN_OVERRIDE_SAVED,
} from './index'
import {
  isDeckPlanCloudConfigured,
  pullDeckPlanOverrides,
  subscribeDeckPlanOverrides,
  type DeckPlanOverridesCloud,
} from './cloudSync'

/**
 * Suscribe marcas de plano en Firestore y las fusiona en localStorage.
 * Montar una vez (p. ej. desde DeckPlanHost).
 */
export function useDeckPlanOverridesSync(): { enabled: boolean } {
  const enabled = isDeckPlanCloudConfigured()
  const ignoreUntil = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let unsub: (() => void) | null = null
    let cancelled = false

    const adopt = (remote: DeckPlanOverridesCloud | null) => {
      if (performance.now() < ignoreUntil.current) return
      if (!remote?.locals) return
      adoptRemoteOverrides(remote.locals, remote.updatedAt)
    }

    void pullDeckPlanOverrides()
      .then((remote) => {
        if (cancelled) return
        adopt(remote)
      })
      .catch(() => undefined)

    unsub = subscribeDeckPlanOverrides(
      (remote) => {
        if (cancelled) return
        adopt(remote)
      },
      () => undefined,
    )

    const onLocalSave = () => {
      ignoreUntil.current = performance.now() + 2000
      const snap = getLocalOverridesSnapshot()
      void publishLocalOverridesToCloud(snap).catch(() => undefined)
    }
    window.addEventListener(SCADA_DECK_PLAN_OVERRIDE_SAVED, onLocalSave)

    return () => {
      cancelled = true
      unsub?.()
      window.removeEventListener(SCADA_DECK_PLAN_OVERRIDE_SAVED, onLocalSave)
    }
  }, [enabled])

  return { enabled }
}
