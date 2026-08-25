/** Símbolos IEC y candado de bloqueo para interruptores */

import type { ProtectionState } from '../types'

/** Interruptor automático motorizado (estilo IEC): abierto = verde, cerrado = rojo */
export function MotorizedBreakerSymbol({
  state,
  orientation = 'vertical',
}: {
  state?: ProtectionState
  /** vertical = bajante; horizontal = acoplador de barras QBT */
  orientation?: 'vertical' | 'horizontal'
}) {
  const open = state !== 'cerrada'
  const color = open ? 'var(--prot-open)' : 'var(--prot-closed)'
  const horizontal = orientation === 'horizontal'

  return (
    <svg
      className={`casc-brk__iec${horizontal ? ' casc-brk__iec--horizontal' : ''}`}
      viewBox="0 0 28 40"
      width={horizontal ? 30 : 22}
      height={horizontal ? 22 : 30}
      aria-hidden
      style={horizontal ? { transform: 'rotate(90deg)' } : undefined}
    >
      <line
        x1="12"
        y1="1"
        x2="12"
        y2={open ? 11 : 14}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {open ? (
        <line
          x1="12"
          y1="11"
          x2="20"
          y2="18"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <line
          x1="12"
          y1="14"
          x2="12"
          y2="22"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
      <line
        x1="12"
        y1={open ? 22 : 22}
        x2="12"
        y2="32"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="16"
        width="14"
        height="10"
        rx="1"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      <rect
        x="19"
        y="17.5"
        width="8"
        height="7"
        rx="0.8"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
      />
      <text
        x="23"
        y="23"
        textAnchor="middle"
        fontSize="5.5"
        fontFamily="IBM Plex Sans, sans-serif"
        fontWeight="700"
        fill={color}
      >
        M
      </text>
      <line
        x1="12"
        y1="32"
        x2="12"
        y2="39"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Interruptor no motorizado (INS, NG125, iC60…): mismo polo IEC sin caja «M».
 */
export function ManualBreakerSymbol({
  state,
  orientation = 'vertical',
}: {
  state?: ProtectionState
  orientation?: 'vertical' | 'horizontal'
}) {
  const open = state !== 'cerrada'
  const color = open ? 'var(--prot-open)' : 'var(--prot-closed)'
  const horizontal = orientation === 'horizontal'

  return (
    <svg
      className={`casc-brk__iec casc-brk__iec--manual${horizontal ? ' casc-brk__iec--horizontal' : ''}`}
      viewBox="0 0 22 40"
      width={horizontal ? 30 : 20}
      height={horizontal ? 20 : 28}
      aria-hidden
      style={horizontal ? { transform: 'rotate(90deg)' } : undefined}
    >
      <line
        x1="11"
        y1="1"
        x2="11"
        y2={open ? 11 : 14}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {open ? (
        <line
          x1="11"
          y1="11"
          x2="18"
          y2="18"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <line
          x1="11"
          y1="14"
          x2="11"
          y2="22"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
      <line
        x1="11"
        y1="22"
        x2="11"
        y2="32"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="16"
        width="14"
        height="10"
        rx="1"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      <line
        x1="11"
        y1="32"
        x2="11"
        y2="39"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Base enchufe trifásica IEC 60309 (III+T): círculo con tres fases + tierra.
 */
export function TrifasicSocketSymbol({
  live = false,
  flowing = false,
}: {
  live?: boolean
  flowing?: boolean
}) {
  const color = flowing
    ? 'var(--flow-wire)'
    : live
      ? 'color-mix(in srgb, var(--flow-wire) 55%, #8a9a94)'
      : '#6b7d77'
  return (
    <svg
      className={`ssb4531-socket-sym${flowing ? ' ssb4531-socket-sym--flow' : ''}${live ? ' ssb4531-socket-sym--live' : ''}`}
      viewBox="0 0 36 36"
      width="28"
      height="28"
      aria-hidden
    >
      <circle
        cx="18"
        cy="16"
        r="11"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
      />
      <circle cx="13" cy="14" r="2.2" fill={color} />
      <circle cx="23" cy="14" r="2.2" fill={color} />
      <circle cx="18" cy="20" r="2.2" fill={color} />
      <path
        d="M18 27v4M14 31h8"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M16 29.5l2-2.5 2 2.5"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Candado rojo = protección bloqueada en abierto (no manipulable) */
export function LockBadge() {
  return (
    <svg
      className="casc-brk__padlock"
      viewBox="0 0 14 16"
      width="12"
      height="14"
      aria-hidden
    >
      <rect
        x="1.5"
        y="7"
        width="11"
        height="8"
        rx="1.2"
        fill="var(--prot-closed)"
        stroke="#3a1010"
        strokeWidth="0.6"
      />
      <path
        d="M4 7V4.8a3 3 0 0 1 6 0V7"
        fill="none"
        stroke="var(--prot-closed)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="7" cy="11" r="1.1" fill="#3a1010" />
    </svg>
  )
}
