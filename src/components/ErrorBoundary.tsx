// Feature: show-up-2-move
// Global error boundary
// Requirements: 16.7 — show descriptive message + retry on unexpected errors

import { Component, ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback renderer. If omitted, a built-in UI is shown. */
  fallback?: (args: { error: Error; retry: () => void }) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * ErrorBoundary
 *
 * React class component that catches unexpected errors thrown anywhere in
 * the component tree below it and renders a descriptive fallback UI with a
 * retry button.
 *
 * Behaviour (Requirement 16.7):
 *  - On error: captures the error in state and renders a descriptive message.
 *  - Retry: clears the captured error, which re-renders `children`. If the
 *    underlying problem has been resolved (e.g. transient network issue)
 *    the tree renders normally; otherwise the boundary simply catches the
 *    next error.
 *
 * Note: Error boundaries ONLY catch render-phase errors. They do NOT catch
 * errors inside event handlers, async callbacks, server data fetches, or
 * errors thrown in the boundary itself. Those are handled by
 * `supabaseErrorHandler` and per-feature error states.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so developers can diagnose in the browser devtools.
    // In production this would be forwarded to an error-tracking service.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Unhandled error:', error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    const { children, fallback } = this.props

    if (error) {
      if (fallback) {
        return fallback({ error, retry: this.handleRetry })
      }
      return <DefaultErrorFallback error={error} onRetry={this.handleRetry} />
    }

    return children
  }
}

// ─── Default fallback UI ─────────────────────────────────────────────────────

function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  return (
    <div role="alert" aria-live="assertive" style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Something went wrong</h1>
        <p style={styles.message}>
          The page ran into an unexpected problem. You can try again; if the
          issue keeps happening, reload the browser or check back in a moment.
        </p>
        <pre style={styles.detail}>{error.message || String(error)}</pre>
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onRetry}
            style={styles.retryButton}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={styles.secondaryButton}
          >
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
    background: '#f9fafb',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '1.5rem',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    maxWidth: 520,
    padding: '2rem',
    width: '100%',
  },
  title: {
    color: '#111827',
    fontSize: '1.5rem',
    marginBottom: '0.75rem',
    marginTop: 0,
  },
  message: {
    color: '#374151',
    lineHeight: 1.5,
    marginBottom: '1.25rem',
  },
  detail: {
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    color: '#4b5563',
    fontSize: '0.8125rem',
    marginBottom: '1.25rem',
    maxHeight: 160,
    overflow: 'auto',
    padding: '0.75rem',
    whiteSpace: 'pre-wrap',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  retryButton: {
    background: '#2563eb',
    border: 'none',
    borderRadius: 8,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.9375rem',
    fontWeight: 600,
    padding: '0.625rem 1.25rem',
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    color: '#374151',
    cursor: 'pointer',
    fontSize: '0.9375rem',
    fontWeight: 500,
    padding: '0.625rem 1.25rem',
  },
}
