import { createContext, useContext, type ReactNode } from 'react'
import type { CircuitLockInfo } from '../utils/parseLocksExcel'

export type LockInfoContextValue = {
  byCircuitId: Record<string, CircuitLockInfo>
  onLockInfo?: (info: CircuitLockInfo, rect: DOMRect) => void
}

const LockInfoContext = createContext<LockInfoContextValue>({
  byCircuitId: {},
})

export function LockInfoProvider({
  byCircuitId,
  onLockInfo,
  children,
}: LockInfoContextValue & { children: ReactNode }) {
  return (
    <LockInfoContext.Provider value={{ byCircuitId, onLockInfo }}>
      {children}
    </LockInfoContext.Provider>
  )
}

export function useCircuitLockInfo(): LockInfoContextValue {
  return useContext(LockInfoContext)
}
