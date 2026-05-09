import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { colors, gradients, radii, shadows } from '../../lib/theme'

type FieldErrors = { email?: string; username?: string; password?: string }
type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'email_in_use' }
  | { status: 'server_error'; message: string }
  | { status: 'success' }

function validateFields(email: string, username: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!email.trim()) errors.email = 'Email is required.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = 'Please enter a valid email address.'

  if (!username.trim()) errors.username = 'Username is required.'
  else if (username.trim().length < 3) errors.username = 'Username must be at least 3 characters.'
  else if (!/^[a-zA-Z0-9_]+$/.test(username.trim()))
    errors.username = 'Letters, numbers, and underscores only.'

  if (!password) errors.password = 'Password is required.'
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.'

  return errors
}

export default function RegisterPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' })

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const errors = validateFields(email, username, password)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSubmitState({ status: 'loading' })

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim() } },
      })

      if (authError) {
        const isEmailInUse =
          authError.status === 422 ||
          (authError as { code?: string }).code === 'email_address_already_used' ||
          authError.message?.toLowerCase().includes('already registered') ||
          authError.message?.toLowerCase().includes('already in use')

        if (isEmailInUse) { setSubmitState({ status: 'email_in_use' }); return }
        const status = authError.status ?? 0
        if (status >= 500) {
          setSubmitState({ status: 'server_error', message: 'Something went wrong on our end. Please try again.' })
          return
        }
        setSubmitState({ status: 'server_error', message: authError.message || 'Registration failed. Please try again.' })
        return
      }

      const userId = authData.user?.id
      if (!userId) { setSubmitState({ status: 'success' }); return }

      const { error: profileError } = await supabase.from('profiles').upsert(
        { id: userId, username: username.trim(), display_name: username.trim() },
        { onConflict: 'id' },
      )
      if (profileError && profileError.code && parseInt(profileError.code, 10) >= 500) {
        setSubmitState({ status: 'server_error', message: 'Account created but profile setup failed. Please try again.' })
        return
      }

      setSubmitState({ status: 'success' })
      navigate('/')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setSubmitState({ status: 'server_error', message })
    }
  }

  const isLoading = submitState.status === 'loading'

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

        <h1 style={styles.title}>Create your account</h1>
        <p style={styles.subtitle}>
          Join in seconds. Declare availability, get matched, and show up.
        </p>

        {submitState.status === 'email_in_use' && (
          <div role="alert" style={styles.warningBanner}>
            <span aria-hidden="true">⚠️</span>
            <span>
              That email is already in use.{' '}
              <Link to="/login" style={styles.bannerLink}>Log in instead</Link>.
            </span>
          </div>
        )}

        {submitState.status === 'server_error' && (
          <div role="alert" style={styles.errorBanner}>
            <span>{submitState.message}</span>
            <button
              type="button"
              onClick={() => setSubmitState({ status: 'idle' })}
              style={styles.retryBtn}
            >
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          <label htmlFor="reg-email" style={styles.label}>Email</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            placeholder="you@example.com"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            style={fieldErrors.email ? styles.inputError : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert" style={styles.fieldError}>{fieldErrors.email}</p>
          )}

          <label htmlFor="reg-username" style={styles.label}>Username</label>
          <input
            id="reg-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            placeholder="e.g. alex_runs"
            aria-invalid={!!fieldErrors.username}
            aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            style={fieldErrors.username ? styles.inputError : undefined}
          />
          {fieldErrors.username && (
            <p id="username-error" role="alert" style={styles.fieldError}>{fieldErrors.username}</p>
          )}

          <label htmlFor="reg-password" style={styles.label}>Password</label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            placeholder="At least 8 characters"
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
            style={fieldErrors.password ? styles.inputError : undefined}
          />
          {fieldErrors.password ? (
            <p id="password-error" role="alert" style={styles.fieldError}>{fieldErrors.password}</p>
          ) : (
            <p id="password-hint" style={styles.fieldHint}>Minimum 8 characters.</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.primaryButton,
              ...(isLoading ? styles.primaryButtonBusy : {}),
            }}
          >
            {isLoading ? (
              <>
                <span className="s2m-spin" style={styles.spinner} aria-hidden="true" />
                Creating account
              </>
            ) : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={styles.footerLink}>Log in</Link>
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
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    background: gradients.brandBg,
  },
  hero: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
  heroOrbOne: {
    position: 'absolute',
    top: '-20%', left: '-10%', width: 520, height: 520, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(79,99,255,0.35) 0%, rgba(79,99,255,0) 65%)',
    filter: 'blur(4px)',
  },
  heroOrbTwo: {
    position: 'absolute',
    bottom: '-25%', right: '-15%', width: 620, height: 620, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,122,77,0.32) 0%, rgba(255,122,77,0) 65%)',
    filter: 'blur(4px)',
  },
  card: {
    position: 'relative',
    width: '100%', maxWidth: 460,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.xl,
    padding: '40px 36px',
    boxShadow: shadows.xl,
  },
  brand: { display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 },
  brandMark: {
    width: 36, height: 36, borderRadius: radii.sm,
    background: gradients.brandStrong, color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, boxShadow: shadows.sm,
  },
  brandWord: { fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: colors.ink[900] },
  brandAccent: { color: colors.accent[500] },

  title: { margin: 0, fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em' },
  subtitle: { margin: '8px 0 24px', color: colors.ink[600], fontSize: 15, lineHeight: 1.55 },

  warningBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: colors.warning[100], border: `1px solid ${colors.warning[300]}`,
    color: colors.warning[900],
    fontSize: 13, borderRadius: radii.sm, padding: '10px 12px', marginBottom: 16,
  },
  bannerLink: { color: 'inherit', fontWeight: 700, textDecoration: 'underline' },
  errorBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    background: colors.danger[100], border: `1px solid ${colors.danger[300]}`,
    color: colors.danger[700], fontSize: 13, borderRadius: radii.sm,
    padding: '10px 12px', marginBottom: 16,
  },
  retryBtn: {
    background: 'transparent',
    color: colors.danger[700],
    border: `1px solid ${colors.danger[300]}`,
    borderRadius: radii.sm,
    padding: '4px 10px',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  },

  form: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: 13, fontWeight: 600, color: colors.ink[700], marginTop: 14, marginBottom: 6 },
  inputError: { borderColor: colors.danger[500] },
  fieldError: { color: colors.danger[700], fontSize: 12, margin: '6px 0 0' },
  fieldHint: { color: colors.ink[500], fontSize: 12, margin: '6px 0 0' },

  primaryButton: {
    marginTop: 24, padding: '12px 16px', border: 'none', borderRadius: radii.sm,
    background: gradients.brandStrong, color: '#fff',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    boxShadow: shadows.md,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
  },
  primaryButtonBusy: { opacity: 0.8, cursor: 'wait' },
  spinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
    display: 'inline-block',
  },

  footer: { marginTop: 24, textAlign: 'center', color: colors.ink[600], fontSize: 14 },
  footerLink: { color: colors.brand[600], fontWeight: 600 },
}
