import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import AuthGuard from './components/AuthGuard'
import ProfilePage from './features/profile/ProfilePage'

/**
 * Placeholder — will be replaced by the real FeedPage in task 11.
 */
function FeedPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Home Feed</h1>
      <p>Welcome! You are logged in.</p>
    </main>
  )
}

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
 * AuthGuard wraps every protected route and redirects unauthenticated users
 * to /login with a descriptive message (Requirements 2.3, 2.4).
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes — wrapped with AuthGuard */}
        <Route
          path="/feed"
          element={
            <AuthGuard message="Log in to see upcoming activities near you.">
              <FeedPage />
            </AuthGuard>
          }
        />
        <Route
          path="/profile"
          element={
            <AuthGuard message="Log in to view and edit your profile.">
              <ProfilePage />
            </AuthGuard>
          }
        />

        {/* Catch-all: redirect root and unknown paths to /feed */}
        <Route path="/" element={<Navigate to="/feed" replace />} />
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
