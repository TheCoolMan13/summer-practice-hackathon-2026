import { FormEvent, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { colors, gradients, radii, shadows } from '../../lib/theme'

/**
 * LoginPage
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
        const status = (authError as { status?: number }).status
        if (status === 400 || authError.message.toLowerCase().includes('invalid')) {
          setError('Email or password is incorrect.')
        } else {
          setError('Something went wrong. Please try again.')
        }
        return
      }
      navigate('/feed', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.container}>
      <div style={styles.hero} aria-hidden="true">
        <div style={styles.heroOrbOne} />
        <div style={styles.heroOrbTwo} />
      </div>

      <section style={styles.card} className="s2m-fade-in">
        <div style={styles.brand}>
          <span style={styles.brandMark} aria-hidden="true">⚡</span>
          <span style={styles.brandWord}>
            ShowUp<span style={styles.brandAccent}>2</span>Move
          </span>
        </div>

        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>
          Sign in to find pickup games near you and match with players in seconds.
        </p>

        {redirectMessage && (
          <div style={styles.infoBanner} role="status">
            <span aria-hidden="true">ℹ️</span>
            <span>{redirectMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          <label htmlFor="email" style={styles.label}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="you@example.com"
            aria-describedby={error ? 'login-error' : undefined}
          />

          <div style={styles.passwordHeader}>
            <label htmlFor="password" style={styles.label}>Password</label>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder="••••••••"
            aria-describedby={error ? 'login-error' : undefined}
          />

          {error && (
            <p id="login-error" role="alert" style={styles.errorBanner}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.primaryButton,
              ...(loading ? styles.primaryButtonBusy : {}),
            }}
          >
            {loading ? (
              <>
                <span className="s2m-spin" style={styles.spinner} aria-hidden="true" />
                Signing in
              </>
            ) : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          New here?{' '}
          <Link to="/register" style={styles.footerLink}>Create an account</Link>
        </p>
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    background: gradients.brandBg,
  },
  hero: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  heroOrbOne: {
    position: 'absolute',
    top: '-20%',
    left: '-10%',
    width: 520,
    height: 520,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(79,99,255,0.35) 0%, rgba(79,99,255,0) 65%)',
    filter: 'blur(4px)',
  },
  heroOrbTwo: {
    position: 'absolute',
    bottom: '-25%',
    right: '-15%',
    width: 620,
    height: 620,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,122,77,0.32) 0%, rgba(255,122,77,0) 65%)',
    filter: 'blur(4px)',
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: 440,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    padding: '40px 36px',
    boxShadow: shadows.xl,
  },
  brand: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    background: gradients.brandStrong,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 700,
    boxShadow: shadows.sm,
  },
  brandWord: {
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: colors.ink[900],
  },
  brandAccent: { color: colors.accent[500] },

  title: {
    margin: 0,
    fontSize: '2rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '8px 0 24px',
    color: colors.ink[600],
    fontSize: 15,
    lineHeight: 1.55,
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: colors.info[100],
    border: `1px solid ${colors.info[300]}`,
    color: colors.info[700],
    fontSize: 13,
    borderRadius: radii.sm,
    padding: '10px 12px',
    marginBottom: 16,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink[700],
    marginTop: 12,
  },
  passwordHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBanner: {
    background: colors.danger[100],
    border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700],
    fontSize: 13,
    borderRadius: radii.sm,
    padding: '10px 12px',
    marginTop: 10,
    marginBottom: 0,
  },
  primaryButton: {
    marginTop: 20,
    padding: '12px 16px',
    border: 'none',
    borderRadius: radii.sm,
    background: gradients.brandStrong,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: shadows.md,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonBusy: { opacity: 0.8, cursor: 'wait' },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
    display: 'inline-block',
  },
  footer: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.ink[600],
    fontSize: 14,
  },
  footerLink: {
    color: colors.brand[600],
    fontWeight: 600,
  },
}
