import { ReactNode, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

interface AuthGuardProps {
  children: ReactNode
  /**
   * Message shown on the login page when the user is redirected here
   * because they tried to access a protected route without being authenticated.
   * Defaults to a generic "Log in to continue" message.
   * (Requirement 2.4)
   */
  message?: string
}

/**
 * AuthGuard
 *
 * Higher-order component (wrapper) that protects routes requiring authentication.
 *
 * Behaviour (Requirements 2.3, 2.4):
 *  - Checks the current Supabase session via `getSession()` on mount.
 *  - Subscribes to `onAuthStateChange` so the guard reacts to sign-in / sign-out
 *    events without requiring a page reload.
 *  - If the user is NOT authenticated, redirects to /login with a descriptive
 *    message passed as a query parameter so LoginPage can display it.
 *  - If the user IS authenticated, renders `children` normally.
 *  - While the session is being resolved, renders a neutral loading state to
 *    avoid a flash of the login redirect.
 */
export default function AuthGuard({
  children,
  message = 'Log in to continue.',
}: AuthGuardProps) {
  const location = useLocation()
  // null  → still loading
  // false → confirmed unauthenticated
  // Session → confirmed authenticated
  const [session, setSession] = useState<Session | null | false>(null)

  useEffect(() => {
    // 1. Resolve the current session immediately
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? false)
    })

    // 2. Keep the guard in sync with auth state changes (sign-in / sign-out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Still resolving — render nothing (or a spinner) to avoid flicker
  if (session === null) {
    return <LoadingScreen />
  }

  // Unauthenticated — redirect to /login with a descriptive message (Req 2.3, 2.4)
  if (session === false) {
    const loginUrl = `/login?message=${encodeURIComponent(message)}`
    return <Navigate to={loginUrl} state={{ from: location }} replace />
  }

  // Authenticated — render the protected content
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        color: '#718096',
        fontSize: '1rem',
      }}
      aria-live="polite"
      aria-label="Loading, please wait"
    >
      Loading…
    </div>
  )
}
