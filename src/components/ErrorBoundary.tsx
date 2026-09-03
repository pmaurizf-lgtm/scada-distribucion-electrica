import React from 'react'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
  message?: string
}

/**
 * Evita que un fallo puntual del render (p. ej. geometría/medición del unifilar)
 * tumbe toda la app: mostramos un fallback y dejamos recargar.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message }
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('App crashed', err)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: '#0e1614',
          color: '#e4ebe8',
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Fallo en la vista</h2>
          <p style={{ opacity: 0.9, marginBottom: 16 }}>
            Se produjo un error renderizando la aplicación.
          </p>
          {this.state.message ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#15201c',
                border: '1px solid #2c3f39',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                color: '#e8d4a8',
                fontSize: 12,
              }}
            >
              {this.state.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              borderRadius: 8,
              border: '1px solid #2c3f39',
              background: '#15201c',
              color: '#e4ebe8',
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    )
  }
}

