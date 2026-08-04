import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { system690 } from '../data/system690'
import {
  sampleProtectionStatus,
  toProtectionStatusMap,
} from '../data/sampleProtectionStatus'
import type { ProtectionStatusEntry, ProtectionStatusMap } from '../types'
import { CascadeView } from './CascadeView'

const emptyStatus: ProtectionStatusMap = {}

export function ScadaCanvas() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatusMap>(() =>
      toProtectionStatusMap(sampleProtectionStatus),
    )
  const [statusSource, setStatusSource] = useState('todos abiertos')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHint, setSearchHint] = useState<string | null>(null)

  const applyStatusEntries = useCallback(
    (entries: ProtectionStatusEntry[], source: string) => {
      setProtectionStatus(toProtectionStatusMap(entries))
      setStatusSource(source)
    },
    [],
  )

  const handleLoadSimulated = useCallback(() => {
    applyStatusEntries(sampleProtectionStatus, 'todos abiertos')
  }, [applyStatusEntries])

  const handleClearStatus = useCallback(() => {
    setProtectionStatus(emptyStatus)
    setStatusSource('sin estado de protecciones')
  }, [])

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as ProtectionStatusEntry[]
        if (!Array.isArray(parsed)) throw new Error('array')
        const valid = parsed.filter(
          (row) =>
            row &&
            typeof row.circuitId === 'string' &&
            (row.state === 'cerrada' || row.state === 'abierta'),
        )
        if (!valid.length) throw new Error('empty')
        applyStatusEntries(valid, `archivo: ${file.name}`)
      } catch {
        setSearchHint(
          'No se pudo leer el JSON de protecciones [{ circuitId, state }].',
        )
      }
      e.target.value = ''
    },
    [applyStatusEntries],
  )

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim().toLowerCase()
    if (!q) return
    const found = system690.equipment.find(
      (eq) =>
        eq.id.toLowerCase().includes(q) ||
        eq.name.toLowerCase().includes(q),
    )
    if (!found) {
      setSearchHint(`No se encontró «${searchQuery}».`)
      return
    }
    setSearchHint(
      `Encontrado ${found.id}. Despliega el MSB correspondiente y el equipo en la cascada.`,
    )
    // Resaltar vía hash/scroll si existe el id en DOM
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-equip="${found.id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const closedCount = Object.values(protectionStatus).filter(
    (s) => s === 'cerrada',
  ).length
  const openCount = Object.values(protectionStatus).filter(
    (s) => s === 'abierta',
  ).length

  return (
    <div className="app-shell app-shell--cascade">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden />
          <div>
            <h1>{system690.title}</h1>
            <p>{system690.vessel} · vista cascada tipo planta eléctrica</p>
          </div>
        </div>
        <div className="topbar__controls">
          <form className="search" onSubmit={handleSearch}>
            <label>
              <span className="sr-only">Buscar equipo</span>
              <input
                type="search"
                placeholder="Buscar equipo (ej. CCM-6PWS0003)…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchHint(null)
                }}
                list="equipment-suggestions"
              />
            </label>
            <datalist id="equipment-suggestions">
              {system690.equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </datalist>
            <button type="submit" className="btn btn--primary">
              Buscar
            </button>
          </form>
          <label className="toggle">
            <span className="legend-line legend-line--normal" />
            Normal
          </label>
          <label className="toggle">
            <span className="legend-line legend-line--alt" />
            Alternativa
          </label>
        </div>
      </header>

      {searchHint && <div className="banner">{searchHint}</div>}

      <main className="workspace workspace--cascade">
        <CascadeView protectionStatus={protectionStatus} />
      </main>

      <footer className="statusbar">
        <span>
          Cascada 690 V · protecciones:{' '}
          <span className="swatch swatch--cerrada" /> {closedCount} cerradas ·{' '}
          <span className="swatch swatch--abierta" /> {openCount} abiertas ·{' '}
          {statusSource}
        </span>
        <div className="statusbar__actions">
          <button type="button" className="btn" onClick={handleLoadSimulated}>
            Simular estado
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Cargar archivo
          </button>
          <button type="button" className="btn" onClick={handleClearStatus}>
            Quitar estados
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>
      </footer>
    </div>
  )
}
