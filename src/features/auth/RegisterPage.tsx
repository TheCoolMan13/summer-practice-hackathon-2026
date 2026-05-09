import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

type FieldErrors = {
  email?: string
  username?: string
  password?: string
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'email_in_use' }
  | { status: 'server_error'; message: string }
  | { status: 'success' }

function validateFields(
  email: string,
  username: string,
  password: string
): FieldErrors {
  const errors: FieldErrors = {}

  if (!email.trim()) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Please enter a valid email address.'
  }

  if (!username.trim()) {
    errors.username = 'Username is required.'
  } else if (username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters.'
  } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    errors.username = 'Username may only contain letters, numbers, and underscores.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

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

    // Client-side validation
    const errors = validateFields(email, username, password)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSubmitState({ status: 'loading' })

    try {
      // Step 1: Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.trim(),
          },
        },
      })

      if (authError) {
        // Supabase returns status 422 or error code 'email_address_already_used'
        // for duplicate emails. Also check the message for safety.
        const isEmailInUse =
          authError.status === 422 ||
          (authError as { code?: string }).code === 'email_address_already_used' ||
          authError.message?.toLowerCase().includes('already registered') ||
          authError.message?.toLowerCase().includes('already in use')

        if (isEmailInUse) {
          setSubmitState({ status: 'email_in_use' })
          return
        }

        // 5xx or unexpected server errors
        const status = authError.status ?? 0
        if (status >= 500) {
          setSubmitState({
            status: 'server_error',
            message: 'Something went wrong on our end. Please try again.',
          })
          return
        }

        // Other errors (e.g. validation from Supabase)
        setSubmitState({
          status: 'server_error',
          message: authError.message || 'Registration failed. Please try again.',
        })
        return
      }

      const userId = authData.user?.id
      if (!userId) {
        // Supabase may return a user object only after email confirmation depending
        // on project settings. Handle the "check your email" case gracefully.
        setSubmitState({ status: 'success' })
        return
      }

      // Step 2: Upsert a row into profiles
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: userId,
          username: username.trim(),
          display_name: username.trim(),
        },
        { onConflict: 'id' }
      )

      if (profileError) {
        const status = profileError.code ? parseInt(profileError.code, 10) : 0
        if (status >= 500) {
          setSubmitState({
            status: 'server_error',
            message: 'Account created but profile setup failed. Please try again.',
          })
          return
        }
        // Non-fatal profile error — still consider registration successful
        // (the profile can be completed later on the profile page)
      }

      setSubmitState({ status: 'success' })
      // Redirect to home / profile page after successful registration
      navigate('/')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      setSubmitState({ status: 'server_error', message })
    }
  }

  function handleRetry() {
    setSubmitState({ status: 'idle' })
  }

  const isLoading = submitState.status === 'loading'

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#f5f5f5',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>
          Create your account
        </h1>

        {/* Email already in use banner */}
        {submitState.status === 'email_in_use' && (
          <div
            role="alert"
            style={{
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#856404',
            }}
          >
            Email already in use. Please use a different email or{' '}
            <a href="/login" style={{ color: '#856404', fontWeight: 600 }}>
              log in
            </a>
            .
          </div>
        )}

        {/* Generic server error banner with retry */}
        {submitState.status === 'server_error' && (
          <div
            role="alert"
            style={{
              background: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: '4px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#721c24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
            }}
          >
            <span>{submitState.message}</span>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                background: 'transparent',
                border: '1px solid #721c24',
                borderRadius: '4px',
                padding: '0.25rem 0.75rem',
                cursor: 'pointer',
                color: '#721c24',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Email field */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: `1px solid ${fieldErrors.email ? '#dc3545' : '#ccc'}`,
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
            {fieldErrors.email && (
              <span
                id="email-error"
                role="alert"
                style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}
              >
                {fieldErrors.email}
              </span>
            )}
          </div>

          {/* Username field */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="username"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              aria-describedby={fieldErrors.username ? 'username-error' : undefined}
              aria-invalid={!!fieldErrors.username}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: `1px solid ${fieldErrors.username ? '#dc3545' : '#ccc'}`,
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
            {fieldErrors.username && (
              <span
                id="username-error"
                role="alert"
                style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}
              >
                {fieldErrors.username}
              </span>
            )}
          </div>

          {/* Password field */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
              aria-invalid={!!fieldErrors.password}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: `1px solid ${fieldErrors.password ? '#dc3545' : '#ccc'}`,
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
            {fieldErrors.password ? (
              <span
                id="password-error"
                role="alert"
                style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}
              >
                {fieldErrors.password}
              </span>
            ) : (
              <span
                id="password-hint"
                style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}
              >
                Minimum 8 characters.
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: isLoading ? '#6c757d' : '#0d6efd',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', textAlign: 'center', color: '#555' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#0d6efd' }}>
            Log in
          </a>
        </p>
      </div>
    </main>
  )
}
