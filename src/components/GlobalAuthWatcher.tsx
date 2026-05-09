// Feature: show-up-2-move
// Global auth state watcher
// Requirements: 2.3, 2.4, 16.7
//
// Listens to Supabase auth state changes at the app root so that if a user's
// session ends unexpectedly (expiry, sign-out from another tab, a 401 on a
// background request), we redirect them to /login with a descriptive message
// instead of leaving them on a broken page.
//
// AuthGuard already handles the per-route check at mount time; this component
// covers the case where the session ends *while* the user is on a protected
// page.

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const PUBLIC_PATHS = ['/login', '/register']

export default function GlobalAuthWatcher() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Fire-and-forget re-check: if we no longer have a session and the
        // user is on a protected page, bounce them to /login.
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) return
          if (PUBLIC_PATHS.includes(location.pathname)) return
          const message = encodeURIComponent(
            'Your session has expired. Please log in again to continue.',
          )
          navigate(`/login?message=${message}`, { replace: true })
        })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [navigate, location.pathname])

  return null
}
