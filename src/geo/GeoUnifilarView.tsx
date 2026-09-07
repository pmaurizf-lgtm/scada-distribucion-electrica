import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { GeoNode, LayoutDocument } from './types'

type Props = {
  document: LayoutDocument
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function nodeClass(kind: GeoNode['kind'], selected: boolean): string {
  return [
    'geo-node',
    `geo-node--${kind}`,
    selected ? 'geo-node--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function GeoUnifilarView({ document: doc, selectedId, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.55)
  const [pan, setPan] = useState({ x: 24, y: 24 })
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setZoom((z) => Math.min(2.5, Math.max(0.15, Math.round(z * factor * 100) / 100)))
  }, [])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as Element
    if (target.closest('[data-geo-node]')) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    setPan({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    })
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  const vb = doc.viewBox

  return (
    <div
      ref={stageRef}
      className="geo-stage"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => onSelect(null)}
    >
      <svg
        className="geo-svg"
        width={vb.width}
        height={vb.height}
        viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          <pattern
            id="geo-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(120,140,160,0.18)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.width}
          height={vb.height}
          fill="url(#geo-grid)"
        />

        {doc.wires.map((w) => {
          if (w.points.length < 2) return null
          const d = w.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
            .join(' ')
          return (
            <path
              key={w.id}
              className={`geo-wire${w.lineType === 'alternativa' ? ' geo-wire--alt' : ''}`}
              d={d}
              fill="none"
            />
          )
        })}

        {doc.nodes.map((n) => (
          <g
            key={n.id}
            data-geo-node={n.id}
            className={nodeClass(n.kind, selectedId === n.id)}
            transform={`translate(${n.x} ${n.y})${n.rotation ? ` rotate(${n.rotation})` : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(n.id)
            }}
          >
            {n.kind === 'bus' ? (
              <rect
                width={n.width}
                height={n.height}
                rx={2}
                className="geo-node__shape geo-node__shape--bus"
              />
            ) : n.kind === 'breaker' ? (
              <rect
                width={n.width}
                height={n.height}
                rx={3}
                className="geo-node__shape geo-node__shape--breaker"
              />
            ) : n.kind === 'frame' ? (
              <rect
                width={n.width}
                height={n.height}
                rx={6}
                className="geo-node__shape geo-node__shape--frame"
              />
            ) : n.kind === 'text' ? (
              null
            ) : (
              <rect
                width={n.width}
                height={n.height}
                rx={4}
                className="geo-node__shape geo-node__shape--equipment"
              />
            )}
            {n.label && (
              <text
                className={`geo-node__label geo-node__label--${n.kind}`}
                x={n.kind === 'text' || n.kind === 'frame' ? 0 : n.width / 2}
                y={
                  n.kind === 'text' || n.kind === 'frame'
                    ? 16
                    : n.kind === 'bus'
                      ? n.height / 2 + 1
                      : n.height / 2 + 4
                }
                textAnchor={
                  n.kind === 'text' || n.kind === 'frame' ? 'start' : 'middle'
                }
              >
                {n.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="geo-zoom" role="group" aria-label="Zoom geometría">
        <button
          type="button"
          className="btn btn--zoom"
          onClick={() => setZoom((z) => Math.max(0.15, Math.round((z - 0.1) * 100) / 100))}
        >
          −
        </button>
        <button
          type="button"
          className="btn btn--zoom btn--zoom-label"
          onClick={() => {
            setZoom(0.55)
            setPan({ x: 24, y: 24 })
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="btn btn--zoom"
          onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 100) / 100))}
        >
          +
        </button>
      </div>
    </div>
  )
}
