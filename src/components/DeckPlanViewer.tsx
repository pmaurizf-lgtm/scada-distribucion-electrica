import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useIsMobileUi } from '../hooks/useIsMobileUi'
import {
  deckPlanImageUrl,
  exportOverridesJson,
  getDeckPlan,
  hitsForLocal,
  listDeckPlans,
  saveLocalOverrideHit,
  type DeckPlanHit,
} from '../deckPlans'

type Props = {
  local: string
  localName?: string
  equipmentId?: string
  onClose: () => void
}

const MIN_Z = 0.35
const MAX_Z = 8
const START_Z = 2.2

export function DeckPlanViewer({
  local,
  localName,
  equipmentId,
  onClose,
}: Props) {
  const isMobile = useIsMobileUi()
  const [index, setIndex] = useState(0)
  const [adjustMode, setAdjustMode] = useState(false)
  const [tick, setTick] = useState(0)
  const [fallbackPlanId, setFallbackPlanId] = useState(
    () => listDeckPlans()[0]?.id ?? '',
  )
  const hits = useMemo(() => hitsForLocal(local), [local, tick])

  const hit: DeckPlanHit | undefined =
    hits.length > 0
      ? hits[Math.min(index, hits.length - 1)]
      : fallbackPlanId
        ? {
            planId: fallbackPlanId,
            x: (getDeckPlan(fallbackPlanId)?.width ?? 4500) / 2,
            y: (getDeckPlan(fallbackPlanId)?.height ?? 800) / 2,
            w: 100,
            h: 60,
            conf: 0,
          }
        : undefined

  const plan = hit ? getDeckPlan(hit.planId) : undefined
  const hasIndexedHits = hits.length > 0

  const viewportRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(START_Z)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)

  const centerOnHit = useCallback((h: DeckPlanHit, z: number) => {
    const vp = viewportRef.current
    if (!vp) return
    setPan({
      x: vp.clientWidth / 2 - h.x * z,
      y: vp.clientHeight / 2 - h.y * z,
    })
    setZoom(z)
  }, [])

  useEffect(() => {
    setIndex(0)
    setAdjustMode(!hasIndexedHits)
  }, [local, hasIndexedHits])

  useEffect(() => {
    if (!hit || imgSize.w < 1) return
    centerOnHit(hit, hasIndexedHits ? START_Z : 0.85)
  }, [hit?.planId, hit?.x, hit?.y, imgSize.w, imgSize.h, centerOnHit, tick, hasIndexedHits])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hits.length > 1) {
        setIndex((i) => (i - 1 + hits.length) % hits.length)
      }
      if (e.key === 'ArrowRight' && hits.length > 1) {
        setIndex((i) => (i + 1) % hits.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, hits.length])

  const onImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
  }

  const zoomAt = (nextZ: number, cx: number, cy: number) => {
    const z = Math.min(MAX_Z, Math.max(MIN_Z, nextZ))
    setPan((p) => {
      const wx = (cx - p.x) / zoom
      const wy = (cy - p.y) / zoom
      return { x: cx - wx * z, y: cy - wy * z }
    })
    setZoom(z)
  }

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault()
    const vp = viewportRef.current
    if (!vp) return
    const r = vp.getBoundingClientRect()
    zoomAt(
      zoom * (e.deltaY > 0 ? 0.9 : 1.1),
      e.clientX - r.left,
      e.clientY - r.top,
    )
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (adjustMode) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    setPan({
      x: d.panX + (e.clientX - d.x),
      y: d.panY + (e.clientY - d.y),
    })
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  const onViewportClick = (e: ReactMouseEvent) => {
    if (!adjustMode || !hit || !plan) return
    const vp = viewportRef.current
    if (!vp) return
    const r = vp.getBoundingClientRect()
    const px = (e.clientX - r.left - pan.x) / zoom
    const py = (e.clientY - r.top - pan.y) / zoom
    saveLocalOverrideHit(local, {
      planId: hit.planId,
      x: Math.round(px),
      y: Math.round(py),
      w: hit.w && hit.w > 0 ? hit.w : 80,
      h: hit.h && hit.h > 0 ? hit.h : 48,
      conf: 100,
    })
    setAdjustMode(false)
    setTick((t) => t + 1)
  }

  const exportOverrides = () => {
    const json = exportOverridesJson()
    void navigator.clipboard?.writeText(json).catch(() => {
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'overrides.json'
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }

  if (typeof document === 'undefined') return null

  const hw = (hit?.w ?? 80) / 2
  const hh = (hit?.h ?? 48) / 2

  return createPortal(
    <div
      className={`notes-modal-backdrop deck-plan-backdrop${isMobile ? ' notes-modal-backdrop--mobile' : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`notes-modal deck-plan-modal${isMobile ? ' notes-modal--mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Plano del local ${local}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="notes-modal__header deck-plan-modal__header">
          <div>
            <p className="notes-modal__kicker">Plano de cubierta</p>
            <h2 className="notes-modal__title">
              {local}
              {localName ? (
                <span className="deck-plan-modal__local-name">
                  {' '}
                  · {localName}
                </span>
              ) : null}
            </h2>
            {equipmentId ? (
              <p className="deck-plan-modal__eq">{equipmentId}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="notes-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="deck-plan-modal__toolbar">
          <div className="deck-plan-modal__nav">
            {hasIndexedHits ? (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={hits.length < 2}
                  onClick={() =>
                    setIndex((i) => (i - 1 + hits.length) % hits.length)
                  }
                >
                  Anterior
                </button>
                <span className="deck-plan-modal__count">
                  {index + 1} / {hits.length}
                  {plan ? ` · ${plan.label}` : ''}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={hits.length < 2}
                  onClick={() => setIndex((i) => (i + 1) % hits.length)}
                >
                  Siguiente
                </button>
              </>
            ) : (
              <>
                <label className="deck-plan-modal__plan-pick">
                  Plano
                  <select
                    value={fallbackPlanId}
                    onChange={(e) => {
                      setFallbackPlanId(e.target.value)
                      setImgSize({ w: 0, h: 0 })
                      setAdjustMode(true)
                    }}
                  >
                    {listDeckPlans().map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="deck-plan-modal__count">
                  Sin índice OCR — coloca la marca
                </span>
              </>
            )}
          </div>
          <div className="deck-plan-modal__zoom">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const vp = viewportRef.current
                if (!vp) return
                zoomAt(zoom / 1.25, vp.clientWidth / 2, vp.clientHeight / 2)
              }}
            >
              −
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (hit) centerOnHit(hit, START_Z)
              }}
            >
              Centrar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const vp = viewportRef.current
                if (!vp) return
                zoomAt(zoom * 1.25, vp.clientWidth / 2, vp.clientHeight / 2)
              }}
            >
              +
            </button>
            <button
              type="button"
              className={`btn${adjustMode ? ' btn--active' : ''}`}
              disabled={!hit}
              onClick={() => setAdjustMode((v) => !v)}
              title="Clic en el plano para reposicionar la marca"
            >
              {adjustMode ? 'Clic en el local…' : 'Ajustar marca'}
            </button>
            <button type="button" className="btn" onClick={exportOverrides}>
              Exportar overrides
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className={`deck-plan-viewport${adjustMode ? ' deck-plan-viewport--adjust' : ''}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onViewportClick}
        >
          {!plan || !hit ? (
            <p className="deck-plan-viewport__empty">
              No hay planos publicados. Ejecuta npm run deck-plans:compress.
            </p>
          ) : (
            <div
              className="deck-plan-stage"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: imgSize.w || plan.width,
                height: imgSize.h || plan.height,
              }}
            >
              <img
                src={deckPlanImageUrl(plan)}
                alt={plan.label}
                draggable={false}
                onLoad={onImgLoad}
                className="deck-plan-stage__img"
              />
              {hasIndexedHits || adjustMode ? (
                <div
                  className="deck-plan-mark"
                  style={{
                    left: hit.x - hw,
                    top: hit.y - hh,
                    width: hw * 2,
                    height: hh * 2,
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
