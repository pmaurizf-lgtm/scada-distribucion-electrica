import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { displaySourceFileName, system690 } from '../data/system690'
import { NavantiaLogo } from '../components/NavantiaLogo'
import { useIsMobileUi } from '../hooks/useIsMobileUi'
import {
  clearGeoLayout,
  downloadGeoLayout,
  loadGeoLayout,
  saveGeoLayout,
} from './geoPersistence'
import { GeoUnifilarView } from './GeoUnifilarView'
import { seedLayoutFromTopology } from './seedFromTopology'
import { isLayoutDocument, type LayoutDocument } from './types'
import './geo.css'

type Props = {
  onBackToCascade: () => void
}

function initialDoc(): LayoutDocument {
  return loadGeoLayout() ?? seedLayoutFromTopology(system690)
}

export function GeoApp({ onBackToCascade }: Props) {
  const isMobile = useIsMobileUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [doc, setDoc] = useState<LayoutDocument>(initialDoc)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const selected = useMemo(
    () => doc.nodes.find((n) => n.id === selectedId) ?? null,
    [doc.nodes, selectedId],
  )

  const persist = useCallback((next: LayoutDocument) => {
    setDoc(next)
    saveGeoLayout(next)
  }, [])

  const handleReseed = () => {
    const next = seedLayoutFromTopology(system690)
    persist(next)
    setSelectedId(null)
    setHint('Layout regenerado desde topología (posiciones semilla).')
  }

  const handleClear = () => {
    clearGeoLayout()
    const next = seedLayoutFromTopology(system690)
    setDoc(next)
    setSelectedId(null)
    setHint('Persistencia geométrica borrada; semilla nueva.')
  }

  const handleExport = () => {
    downloadGeoLayout(doc, 'unifilar-geometria.json')
    setHint('JSON de geometría descargado.')
  }

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      if (!isLayoutDocument(parsed)) {
        setHint('JSON inválido: se espera LayoutDocument v1 (nodes + wires).')
        return
      }
      persist(parsed)
      setSelectedId(null)
      setHint(`Geometría importada: ${parsed.name}`)
    } catch {
      setHint('No se pudo leer el archivo JSON.')
    }
  }

  return (
    <div
      className={`app-shell app-shell--cascade geo-shell${isMobile ? ' app-shell--mobile' : ''}`}
    >
      <div className="app-shell__chrome">
        <header className="topbar">
          <div className="topbar__brand">
            <NavantiaLogo />
            <div className="topbar__brand-meta">
              <p className="topbar__brand-title">
                F110 · Unifilar geométrico (β)
              </p>
              <p>
                {system690.sourceFile
                  ? displaySourceFileName(system690.sourceFile)
                  : system690.vessel}
              </p>
            </div>
          </div>

          <div className="topbar__main">
            <div className="topbar__row topbar__row--tools">
              <div className="topbar__console" role="group" aria-label="Geometría">
                <div className="topbar__actions" role="group">
                  <button type="button" className="btn" onClick={onBackToCascade}>
                    Volver a cascada
                  </button>
                  <button type="button" className="btn" onClick={handleReseed}>
                    Regenerar semilla
                  </button>
                  <button type="button" className="btn" onClick={handleExport}>
                    Exportar JSON
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    Importar JSON
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(ev) => void handleImport(ev)}
                  />
                  <button type="button" className="btn" onClick={handleClear}>
                    Reset layout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {hint && <div className="banner">{hint}</div>}
        {!hint && (
          <div className="banner">
            Producto paralelo: layout con coordenadas XY. Exporta/importa JSON;
            DXF/AutoCAD llegará sobre este mismo modelo. La cascada CSS no se
            modifica.
          </div>
        )}
      </div>

      <main className="workspace workspace--cascade geo-workspace">
        <GeoUnifilarView
          document={doc}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selected && (
          <aside className="geo-inspector">
            <h2 className="geo-inspector__title">Nodo</h2>
            <dl className="geo-inspector__dl">
              <dt>id</dt>
              <dd>{selected.id}</dd>
              <dt>kind</dt>
              <dd>{selected.kind}</dd>
              <dt>x, y</dt>
              <dd>
                {Math.round(selected.x)}, {Math.round(selected.y)}
              </dd>
              <dt>size</dt>
              <dd>
                {Math.round(selected.width)} × {Math.round(selected.height)}
              </dd>
              {selected.equipmentId && (
                <>
                  <dt>equipment</dt>
                  <dd>{selected.equipmentId}</dd>
                </>
              )}
              {selected.circuitId && (
                <>
                  <dt>circuit</dt>
                  <dd>{selected.circuitId}</dd>
                </>
              )}
              {selected.label && (
                <>
                  <dt>label</dt>
                  <dd>{selected.label}</dd>
                </>
              )}
            </dl>
          </aside>
        )}
      </main>

      <footer className="statusbar">
        <span>
          Geometría β · nodos: {doc.nodes.length} · cables: {doc.wires.length} ·{' '}
          {doc.meta?.seededFrom ?? 'layout'} · {doc.name}
          {isMobile ? ' · PWA' : ''}
        </span>
      </footer>
    </div>
  )
}
