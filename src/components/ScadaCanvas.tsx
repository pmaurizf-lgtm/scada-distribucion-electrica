import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { system690 } from '../data/system690'
import {
  sampleProtectionStatus,
  toProtectionStatusMap,
} from '../data/sampleProtectionStatus'
import type { ProtectionStatusEntry, ProtectionStatusMap } from '../types'
import {
  computeEnergyFlow,
  invertProtectionStatus,
  toggleProtectionState,
} from '../utils/energyFlow'
import { findEquipmentByQuery, getUpstreamTrace } from '../utils/upstream'
import { CascadeView, type CascadeFocus } from './CascadeView'

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
  const [focus, setFocus] = useState<CascadeFocus | null>(null)

  const { energizedCircuitIds, energizedEquipmentIds } = useMemo(
    () => computeEnergyFlow(system690, protectionStatus),
    [protectionStatus],
  )

  const applyStatusEntries = useCallback(
    (entries: ProtectionStatusEntry[], source: string) => {
      setProtectionStatus(toProtectionStatusMap(entries))
      setStatusSource(source)
    },
    [],
  )

  const handleSimulateToggle = useCallback(() => {
    setProtectionStatus((prev) => {
      const ids = system690.circuits.map((c) => c.id)
      const next = invertProtectionStatus(prev, ids)
      return next
    })
    setStatusSource('simulación · estados invertidos')
  }, [])

  const handleToggleProtection = useCallback((circuitId: string) => {
    setProtectionStatus((prev) => toggleProtectionState(prev, circuitId))
    setStatusSource('simulación manual')
  }, [])

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
    const found = findEquipmentByQuery(system690.equipment, searchQuery)
    if (!found) {
      setSearchHint(`No se encontró «${searchQuery}».`)
      setFocus(null)
      return
    }
    const trace = getUpstreamTrace(found.id, system690.circuits)
    setFocus({ equipmentId: found.id, trace })
    setSearchHint(
      `${found.id} · ${found.name} — ${trace.circuits.length} alimentaciones (NORM/ALT) aguas arriba.`,
    )
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
            {focus && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFocus(null)
                  setSearchHint(null)
                  setSearchQuery('')
                }}
              >
                Limpiar
              </button>
            )}
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
        <CascadeView
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          focus={focus}
          onToggleProtection={handleToggleProtection}
          onClearFocus={() => {
            setFocus(null)
            setSearchHint(null)
          }}
        />
      </main>

      <footer className="statusbar">
        <span>
          Cascada 690 V · protecciones:{' '}
          <span className="swatch swatch--cerrada" /> {closedCount} cerradas ·{' '}
          <span className="swatch swatch--abierta" /> {openCount} abiertas ·
          flujo: {energizedCircuitIds.size} circ. · {statusSource}
        </span>
        <div className="statusbar__actions">
          <button type="button" className="btn" onClick={handleSimulateToggle}>
            Simular estado
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              applyStatusEntries(sampleProtectionStatus, 'todos abiertos')
            }
          >
            Todos abiertos
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
