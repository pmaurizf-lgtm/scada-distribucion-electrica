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
import type { ProtectionStatusMap } from '../types'
import { computeEnergyFlow, toggleProtectionState } from '../utils/energyFlow'
import { findEquipmentByQuery, getUpstreamTrace } from '../utils/upstream'
import { isPendingFeed } from '../utils/cascadeModel'
import {
  clearPersistedSim,
  savePersistedSim,
} from '../utils/simPersistence'
import {
  parseLockTargetsFromWorkbook,
  resolveLockCircuitIds,
} from '../utils/parseLocksExcel'
import { useIsMobileUi } from '../hooks/useIsMobileUi'
import {
  CascadeView,
  type CascadeFocus,
  type CascadeViewHandle,
  type LockTool,
} from './CascadeView'
import { NavantiaLogo } from './NavantiaLogo'
import { StartupFeedsPanel } from './StartupFeedsPanel'
import { PwaUpdateToast } from './PwaUpdateToast'

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

const REST_STATUS_SOURCE = 'reposo · todos abiertos · gens parados'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function ScadaCanvas() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const candadosDetailsRef = useRef<HTMLDetailsElement>(null)
  const cascadeRef = useRef<CascadeViewHandle>(null)
  const isMobile = useIsMobileUi()
  const [chromeCollapsed, setChromeCollapsed] = useState(false)
  const [protectionStatus, setProtectionStatus] = useState<ProtectionStatusMap>(
    () => toProtectionStatusMap(sampleProtectionStatus),
  )
  const [lockedCircuits, setLockedCircuits] = useState<Set<string>>(
    () => new Set(),
  )
  const [runningGenerators, setRunningGenerators] = useState<Set<string>>(
    () => new Set(),
  )
  const [lockTool, setLockTool] = useState<LockTool>('none')
  const [zoom, setZoom] = useState(1)
  const [statusSource, setStatusSource] = useState(REST_STATUS_SOURCE)
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
  const [startupMode, setStartupMode] = useState(false)
  const [simulationActive, setSimulationActive] = useState(false)

  useEffect(() => {
    // Cada carga: reposo limpio (sin flujo ni candados de sesiones anteriores)
    clearPersistedSim()
  }, [])

  useEffect(() => {
    if (isMobile) {
      setChromeCollapsed(true)
      setSimulationActive(false)
      setLockTool('none')
      setStartupMode(false)
    }
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

  const toggleGenerator = useCallback(
    (genId: string) => {
      if (!simulationActive) {
        setSearchHint(
          'Pulsa «Simular estado» para operar generadores e interruptores.',
        )
        return
      }
      setRunningGenerators((prev) => {
        const next = new Set(prev)
        if (next.has(genId)) next.delete(genId)
        else next.add(genId)
        return next
      })
      setStatusSource('simulación · generador conmutado')
    },
    [simulationActive],
  )

  const resetToRestState = useCallback(() => {
    setProtectionStatus(toProtectionStatusMap(sampleProtectionStatus))
    setRunningGenerators(new Set())
    setLockedCircuits(new Set())
    setLockTool('none')
    setStatusSource(REST_STATUS_SOURCE)
    clearPersistedSim()
  }, [])

  const handleSimulateToggle = useCallback(() => {
    setSimulationActive((active) => {
      if (active) {
        resetToRestState()
        return false
      }
      setStatusSource('simulación activa · puede operar interruptores')
      return true
    })
  }, [resetToRestState])

  const handleToggleProtection = useCallback(
    (circuitId: string) => {
      if (!simulationActive) {
        setSearchHint(
          'Pulsa «Simular estado» para abrir o cerrar interruptores.',
        )
        return false
      }
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
    [lockedCircuits, simulationActive],
  )

  const handleLockCircuit = useCallback((circuitId: string) => {
    if (!simulationActive) {
      setSearchHint(
        'Pulsa «Simular estado» para operar interruptores (candados incluidos).',
      )
      return
    }
    setLockedCircuits((prev) => new Set(prev).add(circuitId))
    setProtectionStatus((prev) => ({ ...prev, [circuitId]: 'abierta' }))
    setStatusSource('candado aplicado · interruptor abierto y bloqueado')
  }, [simulationActive])

  const handleUnlockCircuit = useCallback((circuitId: string) => {
    if (!simulationActive) {
      setSearchHint(
        'Pulsa «Simular estado» para operar interruptores (candados incluidos).',
      )
      return
    }
    setLockedCircuits((prev) => {
      const next = new Set(prev)
      next.delete(circuitId)
      return next
    })
    setStatusSource('candado retirado · interruptor manipulable')
  }, [simulationActive])

  const zoomIn = () => {
    const next = Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100)
    if (cascadeRef.current) cascadeRef.current.zoomAtCenter(next)
    else setZoom(next)
  }
  const zoomOut = () => {
    const next = Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100)
    if (cascadeRef.current) cascadeRef.current.zoomAtCenter(next)
    else setZoom(next)
  }
  const zoomReset = () => {
    if (cascadeRef.current) cascadeRef.current.zoomAtCenter(1)
    else setZoom(1)
  }

  const closeCandadosMenu = useCallback(() => {
    const el = candadosDetailsRef.current
    if (el) el.open = false
  }, [])

  const handleLockExcelChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const buf = await file.arrayBuffer()
        const targets = parseLockTargetsFromWorkbook(buf)
        if (!targets.length) {
          setSearchHint(
            'El Excel no contiene IDs de equipo (PUMA/DCP-10) ni circuitos reconocibles.',
          )
          return
        }
        const { circuitIds, unresolved } = resolveLockCircuitIds(
          system690,
          targets,
          searchableEquipment,
        )
        if (!circuitIds.length) {
          setSearchHint(
            `Ningún candado aplicable (${unresolved.slice(0, 3).join(', ') || 'sin coincidencias'}).`,
          )
          return
        }
        setLockedCircuits(new Set(circuitIds))
        setProtectionStatus((prev) => {
          const next = { ...prev }
          for (const id of circuitIds) next[id] = 'abierta'
          return next
        })
        setLockTool('none')
        const extra =
          unresolved.length > 0
            ? ` · ${unresolved.length} no resueltos`
            : ''
        setStatusSource(
          `candados Excel: ${file.name} · ${circuitIds.length} interruptores${extra}`,
        )
        setSearchHint(
          `Candados cargados: ${circuitIds.length} interruptores abiertos y bloqueados${extra}.`,
        )
        closeCandadosMenu()
      } catch {
        setSearchHint(
          'No se pudo leer el Excel de candados (columna con PUMA / DCP-10 o id de circuito).',
        )
      }
      e.target.value = ''
    },
    [closeCandadosMenu],
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
      {startupMode ? (
        <StartupFeedsPanel
          onClose={() => setStartupMode(false)}
          protectionStatus={protectionStatus}
          lockedCircuits={lockedCircuits}
          energizedCircuitIds={energizedCircuitIds}
          energizedEquipmentIds={energizedEquipmentIds}
        />
      ) : (
        <>
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
                    onClick={collapseAll}
                    title="Plegar todos los cuadros y equipos del unifilar"
                  >
                    Plegar todo
                  </button>
                  {!isMobile && (
                    <button
                      type="button"
                      className={`btn${startupMode ? ' btn--active' : ''}`}
                      onClick={() => setStartupMode(true)}
                      title="Informe de alimentaciones para puesta en marcha de sistemas"
                    >
                      Puesta en marcha
                    </button>
                  )}
                </div>
                {!isMobile && (
                  <div
                    className="topbar__actions topbar__actions--sim"
                    role="group"
                    aria-label="Simulación"
                  >
                    <button
                      type="button"
                      className={`btn${simulationActive ? ' btn--active' : ''}`}
                      onClick={handleSimulateToggle}
                      title={
                        simulationActive
                          ? 'Desactivar simulación (interruptores no operables)'
                          : 'Activar simulación para operar interruptores y generadores'
                      }
                    >
                      {simulationActive ? 'Dejar de simular' : 'Simular estado'}
                    </button>
                    <details
                      ref={candadosDetailsRef}
                      className={`candados-menu${lockTool !== 'none' ? ' candados-menu--active' : ''}`}
                    >
                      <summary
                        className={`btn btn--lock${lockTool !== 'none' ? ' btn--active' : ''}`}
                        title="Poner / quitar candado o cargar lista desde Excel"
                      >
                        Candados
                      </summary>
                      <div className="candados-menu__panel" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className={`candados-menu__item${lockTool === 'lock' ? ' candados-menu__item--on' : ''}`}
                          disabled={!simulationActive}
                          title={
                            simulationActive
                              ? 'Modo: pulsa un interruptor para abrirlo y bloquearlo'
                              : 'Activa «Simular estado» primero'
                          }
                          onClick={() => {
                            setLockTool((t) => (t === 'lock' ? 'none' : 'lock'))
                            closeCandadosMenu()
                          }}
                        >
                          Poner candado
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`candados-menu__item${lockTool === 'unlock' ? ' candados-menu__item--on' : ''}`}
                          disabled={!simulationActive}
                          title={
                            simulationActive
                              ? 'Modo: pulsa un interruptor bloqueado para liberarlo'
                              : 'Activa «Simular estado» primero'
                          }
                          onClick={() => {
                            setLockTool((t) =>
                              t === 'unlock' ? 'none' : 'unlock',
                            )
                            closeCandadosMenu()
                          }}
                        >
                          Quitar candado
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="candados-menu__item"
                          title="Excel con IDs PUMA / DCP-10 (o circuitos) a bloquear"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Cargar Excel…
                        </button>
                      </div>
                    </details>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      hidden
                      onChange={handleLockExcelChange}
                    />
                  </div>
                )}
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
              <div className="topbar__legend" aria-label="Leyenda de tensiones">
                <span className="toggle">
                  <span className="legend-line legend-line--v690" />
                  690 V
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--v440" />
                  440 V
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--v230" />
                  230 V
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--v115" />
                  115 V
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--v24" />
                  24 V
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--v400hz" />
                  400 Hz
                </span>
                <span className="toggle">
                  <span className="legend-line legend-line--alum" />
                  Alumbrado
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
        {!isMobile && lockTool !== 'none' && (
          <div className="banner banner--tool">
            {lockTool === 'lock'
              ? 'Modo poner candado activo: pulsa un interruptor para abrirlo y bloquearlo.'
              : 'Modo quitar candado activo: pulsa un interruptor bloqueado para liberarlo.'}
          </div>
        )}
        {isMobile && lockTool === 'none' && !searchHint && (
          <div className="banner">
            Modo consulta: Localizar o Ver árbol. Doble toque para plegar/desplegar;
            pellizca para zoom y arrastra para desplazar.
          </div>
        )}
        {!isMobile && lockTool === 'none' && !searchHint && !simulationActive && (
          <div className="banner">
            Pulsa «Simular estado» para poder abrir o cerrar interruptores y
            arrancar generadores. Doble clic en cuadros o equipos para
            plegar/desplegar.
          </div>
        )}
        {!isMobile && lockTool === 'none' && !searchHint && simulationActive && (
          <div className="banner">
            {runningGenerators.size === 0
              ? 'Simulación activa: pulsa un generador (G) para arrancarlo (ON), cierra su QG* y luego los interruptores de salida / QBT para ver el flujo de energía.'
              : `Simulación activa: ${runningGenerators.size} generador${runningGenerators.size === 1 ? '' : 'es'} en marcha. Cierra QG* / salidas / QBT para ver el flujo.`}
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
      <PwaUpdateToast enabled={isMobile} />
        </>
      )}
    </div>
  )
}
