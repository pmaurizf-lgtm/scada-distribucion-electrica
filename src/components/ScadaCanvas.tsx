import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { displaySourceFileName, system690 } from '../data/system690'
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
  clearPersistedSim,
  loadPersistedSim,
  savePersistedSim,
} from '../utils/simPersistence'
import { useIsMobileUi } from '../hooks/useIsMobileUi'
import {
  CascadeView,
  type CascadeFocus,
  type CascadeViewHandle,
  type LockTool,
} from './CascadeView'
import { NavantiaLogo } from './NavantiaLogo'

const emptyStatus: ProtectionStatusMap = {}
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.15
const PWA_HINT_KEY = 'scada-f110-pwa-hint-dismissed'

const searchableEquipment = system690.equipment.filter(
  (e) =>
    !e.virtual &&
    !e.id.startsWith('BUS-') &&
    !e.id.startsWith('SPARE-') &&
    e.id !== 'ORIGEN-PENDIENTE',
)

function initialProtectionStatus(): ProtectionStatusMap {
  const saved = loadPersistedSim()
  if (saved?.protectionStatus) return saved.protectionStatus
  return toProtectionStatusMap(sampleProtectionStatus)
}

function initialLocked(): Set<string> {
  const saved = loadPersistedSim()
  return new Set(saved?.lockedCircuits ?? [])
}

function initialGens(): Set<string> {
  const saved = loadPersistedSim()
  return new Set(saved?.runningGenerators ?? [])
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function ScadaCanvas() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cascadeRef = useRef<CascadeViewHandle>(null)
  const isMobile = useIsMobileUi()
  const [chromeCollapsed, setChromeCollapsed] = useState(false)
  const [protectionStatus, setProtectionStatus] =
    useState<ProtectionStatusMap>(initialProtectionStatus)
  const [lockedCircuits, setLockedCircuits] =
    useState<Set<string>>(initialLocked)
  const [runningGenerators, setRunningGenerators] =
    useState<Set<string>>(initialGens)
  const [lockTool, setLockTool] = useState<LockTool>('none')
  const [zoom, setZoom] = useState(1)
  const [statusSource, setStatusSource] = useState(() =>
    loadPersistedSim()
      ? 'estado restaurado (local / offline)'
      : 'todos abiertos · gens parados',
  )
  const [locateQuery, setLocateQuery] = useState('')
  const [feedsQuery, setFeedsQuery] = useState('')
  const [searchHint, setSearchHint] = useState<string | null>(null)
  const [focus, setFocus] = useState<CascadeFocus | null>(null)
  const [locateEquipmentId, setLocateEquipmentId] = useState<string | null>(
    null,
  )
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showPwaHint, setShowPwaHint] = useState(() => {
    try {
      return localStorage.getItem(PWA_HINT_KEY) !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (isMobile) setChromeCollapsed(true)
  }, [isMobile])

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    savePersistedSim({
      protectionStatus,
      lockedCircuits,
      runningGenerators,
    })
  }, [protectionStatus, lockedCircuits, runningGenerators])

  const { energizedCircuitIds, energizedEquipmentIds, energizedBusHalves } =
    useMemo(
      () =>
        computeEnergyFlow(system690, protectionStatus, runningGenerators),
      [protectionStatus, runningGenerators],
    )

  const dismissPwaHint = () => {
    setShowPwaHint(false)
    try {
      localStorage.setItem(PWA_HINT_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const handleInstallClick = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
    dismissPwaHint()
  }

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
      setProtectionStatus((prev) =>
        toggleProtectionState(prev, circuitId, system690),
      )
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
    clearPersistedSim()
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
    if (isMobile) setChromeCollapsed(true)
    const dcp =
      found.dcp10Id && found.dcp10Id !== found.id ? ` / ${found.dcp10Id}` : ''
    const nme = found.nme674Id ? ` / NME ${found.nme674Id}` : ''
    setSearchHint(
      `${found.id}${dcp}${nme} · ${found.name} — localizado en el unifilar.`,
    )
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
    if (isMobile) setChromeCollapsed(true)
    const dcp =
      found.dcp10Id && found.dcp10Id !== found.id ? ` / ${found.dcp10Id}` : ''
    setSearchHint(
      `${found.id}${dcp} · ${found.name} — árbol con ${trace.circuits.length} alimentaciones aguas arriba.`,
    )
  }

  const closedCount = Object.values(protectionStatus).filter(
    (s) => s === 'cerrada',
  ).length
  const openCount = Object.values(protectionStatus).filter(
    (s) => s === 'abierta',
  ).length

  const expandAll = () => {
    setFocus(null)
    setLocateEquipmentId(null)
    setSearchHint(null)
    cascadeRef.current?.expandAll()
  }

  const collapseAll = () => {
    setFocus(null)
    setLocateEquipmentId(null)
    setSearchHint(null)
    cascadeRef.current?.collapseAll()
  }

  const isIos =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)

  const shellClass = [
    'app-shell',
    'app-shell--cascade',
    isMobile ? 'app-shell--mobile' : '',
    isMobile && chromeCollapsed ? 'app-shell--chrome-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      <div className="app-shell__chrome">
        <header className="topbar">
          <div className="topbar__brand">
            <NavantiaLogo />
            <div className="topbar__brand-meta">
              <p className="topbar__brand-title">
                F110 - Distribution Power System
              </p>
              <p>
                {system690.sourceFile
                  ? displaySourceFileName(system690.sourceFile)
                  : system690.vessel}
              </p>
            </div>
          </div>

          {isMobile && (
            <button
              type="button"
              className="btn topbar__chrome-toggle"
              aria-expanded={!chromeCollapsed}
              onClick={() => setChromeCollapsed((c) => !c)}
              title={
                chromeCollapsed
                  ? 'Mostrar herramientas y búsqueda'
                  : 'Ocultar barra y ganar espacio'
              }
            >
              {chromeCollapsed ? 'Menú ▾' : 'Menú ▴'}
            </button>
          )}

          <div className="topbar__main">
            <div className="topbar__row topbar__row--tools">
              <div
                className="topbar__console"
                role="group"
                aria-label="Herramientas"
              >
                <div
                  className="topbar__actions topbar__actions--view"
                  role="group"
                  aria-label="Vista"
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={expandAll}
                    title="Desplegar todos los cuadros y equipos del unifilar"
                  >
                    Desplegar todo
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={collapseAll}
                    title="Plegar todos los cuadros y equipos del unifilar"
                  >
                    Plegar todo
                  </button>
                </div>
                <div
                  className="topbar__actions topbar__actions--sim"
                  role="group"
                  aria-label="Simulación"
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSimulateToggle}
                  >
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
                </div>
                <div
                  className="topbar__actions topbar__actions--data"
                  role="group"
                  aria-label="Datos"
                >
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
                  <button
                    type="button"
                    className="btn"
                    onClick={handleClearStatus}
                  >
                    Limpiar estados
                  </button>
                </div>
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
                  title="Busca y centra el equipo en el unifilar (PUMA o DCP-10)"
                >
                  Localizar
                </span>
                <label className="search__field">
                  <span className="sr-only">Localizar equipo en unifilar</span>
                  <input
                    type="search"
                    placeholder="PUMA o DCP-10 (ej. LCS-4PWS0003)…"
                    value={locateQuery}
                    onChange={(e) => {
                      setLocateQuery(e.target.value)
                      setSearchHint(null)
                    }}
                    list="equipment-suggestions-locate"
                    enterKeyHint="search"
                  />
                </label>
                <datalist id="equipment-suggestions-locate">
                  {searchableEquipment.map((eq) => (
                    <option key={`puma-${eq.id}`} value={eq.id}>
                      {eq.dcp10Id && eq.dcp10Id !== eq.id
                        ? `PUMA · ${eq.name}`
                        : eq.name}
                    </option>
                  ))}
                  {searchableEquipment.map((eq) =>
                    eq.dcp10Id && eq.dcp10Id !== eq.id ? (
                      <option key={`dcp-${eq.id}`} value={eq.dcp10Id}>
                        {`DCP-10 · ${eq.id} · ${eq.name}`}
                      </option>
                    ) : null,
                  )}
                </datalist>
                <button type="submit" className="btn btn--primary">
                  Ir
                </button>
                {locateEquipmentId && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      cascadeRef.current?.goBack()
                      setLocateQuery('')
                      setSearchHint(null)
                    }}
                  >
                    Volver
                  </button>
                )}
              </form>

              <form
                className="search search--feeds"
                onSubmit={handleFeedsSearch}
              >
                <span
                  className="search__label"
                  title="Árbol de alimentaciones (busca por PUMA o DCP-10)"
                >
                  Árbol
                </span>
                <label className="search__field">
                  <span className="sr-only">Árbol de alimentaciones</span>
                  <input
                    type="search"
                    placeholder="Árbol: PUMA o DCP-10…"
                    value={feedsQuery}
                    onChange={(e) => {
                      setFeedsQuery(e.target.value)
                      setSearchHint(null)
                    }}
                    list="equipment-suggestions-feeds"
                    enterKeyHint="search"
                  />
                </label>
                <datalist id="equipment-suggestions-feeds">
                  {searchableEquipment.map((eq) => (
                    <option key={`feeds-puma-${eq.id}`} value={eq.id}>
                      {eq.dcp10Id && eq.dcp10Id !== eq.id
                        ? `PUMA · ${eq.name}`
                        : eq.name}
                    </option>
                  ))}
                  {searchableEquipment.map((eq) =>
                    eq.dcp10Id && eq.dcp10Id !== eq.id ? (
                      <option key={`feeds-dcp-${eq.id}`} value={eq.dcp10Id}>
                        {`DCP-10 · ${eq.id} · ${eq.name}`}
                      </option>
                    ) : null,
                  )}
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

        {isMobile && showPwaHint && (
          <div className="pwa-install" role="status">
            <p className="pwa-install__text">
              <strong>Instalar en el móvil</strong>
              {installPrompt
                ? ' — añade F110 DPS a la pantalla de inicio para usarla sin conexión.'
                : isIos
                  ? ' — en Safari: Compartir → «Añadir a pantalla de inicio».'
                  : ' — en el menú del navegador: «Instalar aplicación» / «Añadir a pantalla de inicio».'}
            </p>
            <div className="pwa-install__actions">
              {installPrompt && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void handleInstallClick()}
                >
                  Instalar
                </button>
              )}
              <button type="button" className="btn" onClick={dismissPwaHint}>
                Entendido
              </button>
            </div>
          </div>
        )}

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
              ? isMobile
                ? 'Simulación: toca un generador (G) para arrancarlo, cierra QG* y salidas. Pellizca para zoom; arrastra para desplazar. Doble toque en cuadros para plegar/desplegar.'
                : 'Simulación: pulsa un generador (G) para arrancarlo (ON), cierra su QG* y luego los interruptores de salida / QBT para ver el flujo de energía.'
              : `Simulación: ${runningGenerators.size} generador${runningGenerators.size === 1 ? '' : 'es'} en marcha. Cierra QG* / salidas / QBT para ver el flujo (doble clic en cuadros o equipos para plegar/desplegar).`}
          </div>
        )}
      </div>

      <main className="workspace workspace--cascade">
        <CascadeView
          ref={cascadeRef}
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
          {isMobile ? ' · PWA' : ''}
        </span>
      </footer>
    </div>
  )
}
