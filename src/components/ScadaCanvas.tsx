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
import { allSectionCouplers, isPendingFeed } from '../utils/cascadeModel'
import {
  CascadeView,
  type CascadeFocus,
  type LockTool,
} from './CascadeView'

const emptyStatus: ProtectionStatusMap = {}
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.15

const searchableEquipment = system690.equipment.filter(
  (e) =>
    !e.virtual &&
    !e.id.startsWith('BUS-') &&
    !e.id.startsWith('SPARE-') &&
    e.id !== 'ORIGEN-PENDIENTE',
)

export function ScadaCanvas() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatusMap>(() =>
      toProtectionStatusMap(sampleProtectionStatus),
    )
  const [lockedCircuits, setLockedCircuits] = useState<Set<string>>(
    () => new Set(),
  )
  const [runningGenerators, setRunningGenerators] = useState<Set<string>>(
    () => new Set(),
  )
  const [lockTool, setLockTool] = useState<LockTool>('none')
  const [zoom, setZoom] = useState(1)
  const [statusSource, setStatusSource] = useState('todos abiertos · gens parados')
  const [locateQuery, setLocateQuery] = useState('')
  const [feedsQuery, setFeedsQuery] = useState('')
  const [searchHint, setSearchHint] = useState<string | null>(null)
  const [focus, setFocus] = useState<CascadeFocus | null>(null)
  const [locateEquipmentId, setLocateEquipmentId] = useState<string | null>(
    null,
  )

  const { energizedCircuitIds, energizedEquipmentIds, energizedBusHalves } =
    useMemo(
      () =>
        computeEnergyFlow(system690, protectionStatus, runningGenerators),
      [protectionStatus, runningGenerators],
    )

  const toggleGenerator = useCallback((genId: string) => {
    setRunningGenerators((prev) => {
      const next = new Set(prev)
      if (next.has(genId)) next.delete(genId)
      else next.add(genId)
      return next
    })
    setStatusSource('simulación · generador conmutado')
  }, [])

  const applyStatusEntries = useCallback(
    (entries: ProtectionStatusEntry[], source: string) => {
      setProtectionStatus(toProtectionStatusMap(entries))
      setStatusSource(source)
    },
    [],
  )

  const handleSimulateToggle = useCallback(() => {
    setProtectionStatus((prev) => {
      const ids = [
        ...system690.circuits.map((c) => c.id),
        ...allSectionCouplers().map((c) => c.id),
      ].filter(
        (id) =>
          !lockedCircuits.has(id) &&
          !system690.circuits.some((c) => c.id === id && isPendingFeed(c)),
      )
      return invertProtectionStatus(prev, ids)
    })
    setStatusSource('simulación · estados invertidos (excepto bloqueados)')
  }, [lockedCircuits])

  const handleToggleProtection = useCallback(
    (circuitId: string) => {
      const circuit = system690.circuits.find((c) => c.id === circuitId)
      if (circuit && isPendingFeed(circuit)) {
        setSearchHint(
          'Alimentación pendiente de identificar: no se puede operar hasta conocer el origen.',
        )
        return false
      }
      if (lockedCircuits.has(circuitId)) {
        setSearchHint(
          `Interruptor bloqueado con candado: no se puede cerrar hasta quitar el candado.`,
        )
        return false
      }
      setProtectionStatus((prev) => toggleProtectionState(prev, circuitId))
      setStatusSource('simulación manual')
      return true
    },
    [lockedCircuits],
  )

  const handleLockCircuit = useCallback((circuitId: string) => {
    setLockedCircuits((prev) => new Set(prev).add(circuitId))
    setProtectionStatus((prev) => ({ ...prev, [circuitId]: 'abierta' }))
    setStatusSource('candado aplicado · interruptor abierto y bloqueado')
  }, [])

  const handleUnlockCircuit = useCallback((circuitId: string) => {
    setLockedCircuits((prev) => {
      const next = new Set(prev)
      next.delete(circuitId)
      return next
    })
    setStatusSource('candado retirado · interruptor manipulable')
  }, [])

  const handleClearStatus = useCallback(() => {
    setProtectionStatus(emptyStatus)
    setStatusSource('sin estado de protecciones')
  }, [])

  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))
  const zoomOut = () =>
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))
  const zoomReset = () => setZoom(1)

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

  const handleLocate = (e: FormEvent) => {
    e.preventDefault()
    const found = findEquipmentByQuery(searchableEquipment, locateQuery)
    if (!found) {
      setSearchHint(`No se encontró «${locateQuery}» en el unifilar.`)
      setLocateEquipmentId(null)
      return
    }
    setFocus(null)
    setLocateEquipmentId(found.id)
    setSearchHint(`${found.id} · ${found.name} — localizado en el unifilar.`)
  }

  const handleFeedsSearch = (e: FormEvent) => {
    e.preventDefault()
    const found = findEquipmentByQuery(searchableEquipment, feedsQuery)
    if (!found) {
      setSearchHint(`No se encontró «${feedsQuery}» para el árbol.`)
      setFocus(null)
      return
    }
    const trace = getUpstreamTrace(found.id, system690.circuits)
    setLocateEquipmentId(null)
    setFocus({ equipmentId: found.id, trace })
    setSearchHint(
      `${found.id} · ${found.name} — árbol con ${trace.circuits.length} alimentaciones aguas arriba.`,
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
      <div className="app-shell__chrome">
        <header className="topbar">
          <div className="topbar__brand">
            <span className="topbar__mark" aria-hidden />
            <div>
              <h1>{system690.title}</h1>
              <p>{system690.vessel} · vista cascada tipo planta eléctrica</p>
            </div>
          </div>

          <div className="topbar__main">
            <div className="topbar__row topbar__row--tools">
              <div className="topbar__actions">
                <button type="button" className="btn" onClick={handleSimulateToggle}>
                  Simular estado
                </button>
                <button
                  type="button"
                  className={`btn btn--lock${lockTool === 'lock' ? ' btn--active' : ''}`}
                  onClick={() =>
                    setLockTool((t) => (t === 'lock' ? 'none' : 'lock'))
                  }
                >
                  Poner candado
                </button>
                <button
                  type="button"
                  className={`btn btn--lock${lockTool === 'unlock' ? ' btn--active' : ''}`}
                  onClick={() =>
                    setLockTool((t) => (t === 'unlock' ? 'none' : 'unlock'))
                  }
                >
                  Quitar candado
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Cargar JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={handleFileChange}
                />
                <button type="button" className="btn" onClick={handleClearStatus}>
                  Limpiar estados
                </button>
              </div>
              <div className="zoom-controls" role="group" aria-label="Zoom">
                <button
                  type="button"
                  className="btn btn--zoom"
                  onClick={zoomOut}
                  title="Alejar"
                >
                  −
                </button>
                <button
                  type="button"
                  className="btn btn--zoom btn--zoom-label"
                  onClick={zoomReset}
                  title="Ajustar a vista / 100%"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="btn btn--zoom"
                  onClick={zoomIn}
                  title="Acercar"
                >
                  +
                </button>
              </div>
              <div className="topbar__legend" aria-label="Leyenda de líneas">
                <span className="toggle">
                  <span className="legend-line legend-line--normal" />
                  Normal
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--alt" />
                  Alternativa
                </span>
              </div>
            </div>

            <div className="topbar__row topbar__row--search">
              <form className="search search--locate" onSubmit={handleLocate}>
                <span
                  className="search__label"
                  title="Busca y centra el equipo en el unifilar"
                >
                  Localizar
                </span>
                <label className="search__field">
                  <span className="sr-only">Localizar equipo en unifilar</span>
                  <input
                    type="search"
                    placeholder="Equipo en unifilar (ej. LCS-4PWS0003)…"
                    value={locateQuery}
                    onChange={(e) => {
                      setLocateQuery(e.target.value)
                      setSearchHint(null)
                    }}
                    list="equipment-suggestions-locate"
                  />
                </label>
                <datalist id="equipment-suggestions-locate">
                  {searchableEquipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </datalist>
                <button type="submit" className="btn btn--primary">
                  Ir
                </button>
                {locateEquipmentId && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setLocateEquipmentId(null)
                      setLocateQuery('')
                      setSearchHint(null)
                    }}
                  >
                    Limpiar
                  </button>
                )}
              </form>

              <form className="search search--feeds" onSubmit={handleFeedsSearch}>
                <span
                  className="search__label"
                  title="Muestra el árbol de alimentaciones NORM/ALT aguas arriba"
                >
                  Árbol
                </span>
                <label className="search__field">
                  <span className="sr-only">Árbol de alimentaciones</span>
                  <input
                    type="search"
                    placeholder="Árbol de alimentaciones…"
                    value={feedsQuery}
                    onChange={(e) => {
                      setFeedsQuery(e.target.value)
                      setSearchHint(null)
                    }}
                    list="equipment-suggestions-feeds"
                  />
                </label>
                <datalist id="equipment-suggestions-feeds">
                  {searchableEquipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </datalist>
                <button type="submit" className="btn btn--feeds">
                  Ver árbol
                </button>
                {focus && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setFocus(null)
                      setFeedsQuery('')
                      setSearchHint(null)
                    }}
                  >
                    Limpiar
                  </button>
                )}
              </form>
            </div>
          </div>
        </header>

        {searchHint && <div className="banner">{searchHint}</div>}
        {lockTool !== 'none' && (
          <div className="banner banner--tool">
            {lockTool === 'lock'
              ? 'Modo poner candado activo: pulsa un interruptor para abrirlo y bloquearlo.'
              : 'Modo quitar candado activo: pulsa un interruptor bloqueado para liberarlo.'}
          </div>
        )}
        {lockTool === 'none' && !searchHint && (
          <div className="banner">
            {runningGenerators.size === 0
              ? 'Simulación: pulsa un generador (G) para arrancarlo (ON), cierra su QG* y luego los interruptores de salida / QBT para ver el flujo de energía.'
              : `Simulación: ${runningGenerators.size} generador${runningGenerators.size === 1 ? '' : 'es'} en marcha. Cierra QG* / salidas / QBT para ver el flujo (doble clic en cuadros o equipos para plegar/desplegar).`}
          </div>
        )}
      </div>

      <main className="workspace workspace--cascade">
        <CascadeView
          protectionStatus={protectionStatus}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
          energizedBusHalves={energizedBusHalves}
          runningGenerators={runningGenerators}
          lockedCircuits={lockedCircuits}
          lockTool={lockTool}
          zoom={zoom}
          onZoomChange={setZoom}
          focus={focus}
          locateEquipmentId={locateEquipmentId}
          onToggleProtection={handleToggleProtection}
          onLockCircuit={handleLockCircuit}
          onUnlockCircuit={handleUnlockCircuit}
          onToggleGenerator={toggleGenerator}
          onClearFocus={() => {
            setFocus(null)
            setSearchHint(null)
          }}
          onClearLocate={() => {
            setLocateEquipmentId(null)
            setSearchHint(null)
          }}
        />
      </main>

      <footer className="statusbar">
        <span>
          Cascada 690 V · protecciones:{' '}
          <span className="swatch swatch--cerrada" /> {closedCount} cerradas ·{' '}
          <span className="swatch swatch--abierta" /> {openCount} abiertas ·
          gens: {runningGenerators.size} en marcha · candados:{' '}
          {lockedCircuits.size} · flujo: {energizedCircuitIds.size} circ. · zoom{' '}
          {Math.round(zoom * 100)}% · {statusSource}
        </span>
      </footer>
    </div>
  )
}
