/** Buques F-11x: un escritorio de simulación / LOTO por unidad. */

export type VesselId = 'F-111' | 'F-112' | 'F-113' | 'F-114' | 'F-115'

export type VesselInfo = {
  id: VesselId
  name: string
  /** Etiqueta corta para barra / select. */
  label: string
}

export const VESSELS: readonly VesselInfo[] = [
  { id: 'F-111', name: 'Bonifaz', label: 'F-111 · Bonifaz' },
  { id: 'F-112', name: 'Roger de Lauria', label: 'F-112 · Roger de Lauria' },
  {
    id: 'F-113',
    name: 'Menéndez de Avilés',
    label: 'F-113 · Menéndez de Avilés',
  },
  { id: 'F-114', name: 'Luis de Córdova', label: 'F-114 · Luis de Córdova' },
  { id: 'F-115', name: 'Barceló', label: 'F-115 · Barceló' },
] as const

export function isVesselId(value: string): value is VesselId {
  return VESSELS.some((v) => v.id === value)
}

export function vesselById(id: VesselId): VesselInfo {
  return VESSELS.find((v) => v.id === id)!
}

/** Solo F-111 arranca con el seed LOTO del proyecto; el resto vacío. */
export function vesselUsesSeedLocks(id: VesselId): boolean {
  return id === 'F-111'
}
