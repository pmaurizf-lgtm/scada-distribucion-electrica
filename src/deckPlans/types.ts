/** Tipos e índice de planos de cubierta (local → hits). */

export interface DeckPlanMeta {
  id: string
  file: string
  label: string
  width: number
  height: number
  sourceFile?: string
}

export interface DeckPlanHit {
  planId: string
  /** Centro del local en píxeles de la imagen publicada. */
  x: number
  y: number
  w?: number
  h?: number
  conf?: number
  /** ISO · última corrección manual / nube (LWW). */
  updatedAt?: string
}


export interface DeckPlanManifest {
  version: number
  plans: DeckPlanMeta[]
}

export interface DeckPlanHitsFile {
  version: number
  generatedAt?: string
  locals: Record<string, DeckPlanHit[]>
}
