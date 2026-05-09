import { FormEvent, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

/**
 * LoginPage
 *
 * Handles user authentication via Supabase email/password sign-in.
 *
 * Error handling (Requirements 2.2, 2.3, 2.4):
 *  - HTTP 400 (invalid credentials) → "Email or password is incorrect" (no field disambiguation)
 *  - Network / 5xx errors           → generic error with retry prompt
 *  - Successful login               → redirect to /feed (or the page that triggered the guard)
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // A descriptive message may be passed via ?message= when AuthGuard redirects here
  const redirectMessage = searchParams.get('message')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        // Supabase returns status 400 for invalid credentials.
        // We intentionally show the same message regardless of which field
        // is wrong to avoid field disambiguation (Requirement 2.2).
        const status = (authError as { status?: number }).status
        if (status === 400 || authError.message.toLowerCase().includes('invalid')) {
          setError('Email or password is incorrect.')
        } else {
          // Network / 5xx / unexpected errors
          setError('Something went wrong. Please try again.')
        }
        return
      }

      // Successful login — redirect to /feed (Requirement 2.1)
      navigate('/feed', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>ShowUp2Move</h1>
        <h2 style={styles.subtitle}>Sign in</h2>

        {/* Descriptive context message from AuthGuard (Requirement 2.4) */}
        {redirectMessage && (
          <p style={styles.infoMessage} role="status">
            {redirectMessage}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          <label htmlFor="email" style={styles.label}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={styles.input}
            aria-describedby={error ? 'login-error' : undefined}
          />

          <label htmlFor="password" style={styles.label}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={styles.input}
            aria-describedby={error ? 'login-error' : undefined}
          />

          {/* Error message — no field disambiguation (Requirement 2.2) */}
          {error && (
            <p id="login-error" style={styles.errorMessage} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footerText}>
          Don&apos;t have an account?{' '}
          <Link to="/register" style={styles.link}>
            Register
          </Link>
        </p>
      </div>
    </main>
  )
}

// ─── Inline styles (no external CSS dependency required for scaffold) ─────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f8',
    padding: '1rem',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 0.25rem',
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#1a202c',
    textAlign: 'center',
  },
  subtitle: {
    margin: '0 0 1.5rem',
    fontSize: '1.1rem',
    fontWeight: 500,
    color: '#4a5568',
    textAlign: 'center',
  },
  infoMessage: {
    backgroundColor: '#ebf8ff',
    border: '1px solid #bee3f8',
    borderRadius: '6px',
    color: '#2b6cb0',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#2d3748',
    marginTop: '0.5rem',
  },
  input: {
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '1rem',
    padding: '0.625rem 0.75rem',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  errorMessage: {
    backgroundColor: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    color: '#c53030',
    fontSize: '0.875rem',
    marginTop: '0.25rem',
    padding: '0.625rem 0.75rem',
  },
  button: {
    backgroundColor: '#3182ce',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    marginTop: '1rem',
    padding: '0.75rem',
    transition: 'background-color 0.15s',
  },
  buttonDisabled: {
    backgroundColor: '#90cdf4',
    cursor: 'not-allowed',
  },
  footerText: {
    color: '#718096',
    fontSize: '0.875rem',
    marginTop: '1.25rem',
    textAlign: 'center',
  },
  link: {
    color: '#3182ce',
    textDecoration: 'none',
    fontWeight: 600,
  },
}
