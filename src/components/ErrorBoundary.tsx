// Feature: show-up-2-move
// Global error boundary
// Requirements: 16.7

import { Component, ErrorInfo, ReactNode } from 'react'
import { colors, gradients, radii, shadows } from '../lib/theme'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (args: { error: Error; retry: () => void }) => ReactNode
}
interface ErrorBoundaryState { error: Error | null }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Unhandled error:', error, info)
  }
  handleRetry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    const { children, fallback } = this.props
    if (error) {
      if (fallback) return fallback({ error, retry: this.handleRetry })
      return <DefaultErrorFallback error={error} onRetry={this.handleRetry} />
    }
    return children
  }
}

function DefaultErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" aria-live="assertive" style={styles.container}>
      <div style={styles.card} className="s2m-fade-in">
        <div style={styles.iconWrap} aria-hidden="true">⚠️</div>
        <h1 style={styles.title}>Something went sideways</h1>
        <p style={styles.message}>
          The page hit an unexpected snag. Give it another try — if it keeps happening,
          reload the browser or come back in a moment.
        </p>
        <details style={styles.details}>
          <summary style={styles.summary}>Error details</summary>
          <pre style={styles.detail}>{error.message || String(error)}</pre>
        </details>
        <div style={styles.actions}>
          <button type="button" onClick={onRetry} style={styles.retryButton}>Try again</button>
          <button type="button" onClick={() => window.location.reload()} style={styles.secondaryButton}>
            Reload page
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
    background: gradients.brandBg,
  },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    boxShadow: shadows.xl,
    maxWidth: 540,
    padding: '36px 32px',
    width: '100%',
    textAlign: 'center',
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: '50%',
    background: colors.warning[100],
    color: colors.warning[700],
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, marginBottom: 16,
  },
  title: { margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' },
  message: { color: colors.ink[600], margin: '10px auto 20px', maxWidth: 420, lineHeight: 1.55 },
  details: {
    background: colors.ink[50],
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 20,
    textAlign: 'left',
  },
  summary: {
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink[700],
  },
  detail: {
    background: 'transparent',
    color: colors.ink[700],
    fontSize: 12,
    lineHeight: 1.5,
    margin: '10px 0 0',
    maxHeight: 160,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  retryButton: {
    background: gradients.brandStrong,
    border: 'none',
    borderRadius: radii.sm,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 20px',
    boxShadow: shadows.md,
  },
  secondaryButton: {
    background: 'transparent',
    border: `1px solid ${colors.ink[300]}`,
    borderRadius: radii.sm,
    color: colors.ink[700],
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 20px',
  },
}
