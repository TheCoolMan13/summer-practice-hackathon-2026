import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import RealtimeStatusBanner from './components/RealtimeStatusBanner'
import GlobalAuthWatcher from './components/GlobalAuthWatcher'
import ProfilePage from './features/profile/ProfilePage'
import FeedPage from './features/feed/FeedPage'
import CreateEventPage from './features/events/CreateEventPage'
import EventDetailPage from './features/events/EventDetailPage'

/**
 * App
 *
 * Root component that sets up client-side routing with react-router-dom v6.
 *
 * Route structure:
 *  /              → redirect to /feed
 *  /login         → LoginPage (public)
 *  /register      → RegisterPage (public)
 *  /feed          → FeedPage (protected by AuthGuard)
 *
 * Resilience (Requirements 2.3, 2.4, 16.7):
 *  - ErrorBoundary wraps the entire router and catches render-phase errors,
 *    showing a descriptive message with a retry button instead of a blank
 *    screen.
 *  - GlobalAuthWatcher listens for auth state changes at the app level and
 *    redirects to /login with a descriptive message when the session ends
 *    (covers 401 scenarios from background requests).
 *  - RealtimeStatusBanner shows a "Reconnecting…" indicator at the top of
 *    the viewport while the Supabase Realtime WebSocket is dropped.
 *
 *  Per-request 401/403/5xx handling is centralised in
 *  `src/lib/supabaseErrorHandler.ts` and consumed by individual hooks and
 *  pages when they call Supabase.
 *
 * AuthGuard wraps every protected route and redirects unauthenticated users
 * to /login with a descriptive message (Requirements 2.3, 2.4).
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalAuthWatcher />
        <RealtimeStatusBanner />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes — wrapped with AuthGuard and Layout */}
          <Route
            path="/feed"
            element={
              <AuthGuard message="Log in to see upcoming activities near you.">
                <Layout>
                  <FeedPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGuard message="Log in to view and edit your profile.">
                <Layout>
                  <ProfilePage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/events/create"
            element={
              <AuthGuard message="Log in to create an event.">
                <Layout>
                  <CreateEventPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/events/:eventId"
            element={
              <AuthGuard message="Log in to view event details.">
                <Layout>
                  <EventDetailPage />
                </Layout>
              </AuthGuard>
            }
          />

          {/* Catch-all: redirect root and unknown paths to /feed */}
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
