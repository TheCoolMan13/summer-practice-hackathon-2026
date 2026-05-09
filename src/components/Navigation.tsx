// Feature: show-up-2-move
// Navigation bar component with notification bell
// Provides app-wide navigation and user menu

import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from '../features/notifications/NotificationBell'
import { useAIHealth } from '../lib/aiHealth'

/**
 * Navigation
 *
 * Top navigation bar with:
 *  - App logo/title
 *  - Main navigation links (Feed, Profile, Create Event)
 *  - Notification bell with live updates
 *  - User menu with logout
 */
export default function Navigation() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState<string>('User')
  const [showUserMenu, setShowUserMenu] = useState(false)

  // Surface global AI health state to the NotificationBell so that its
  // existing degraded-mode toast fires whenever the ai-proxy probe reports
  // the AI microservice as unavailable (Req 14.5).
  const { isDegraded: aiDegraded } = useAIHealth()

  useEffect(() => {
    async function loadUserProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // maybeSingle() avoids a HTTP 406 when the user hasn't saved a
      // profile row yet; returns { data: null } instead.
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.display_name) {
        setDisplayName(profile.display_name)
      }
    }

    loadUserProfile()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        {/* Logo/Title */}
        <div style={styles.logo} onClick={() => navigate('/feed')}>
          <span style={styles.logoIcon}>⚽</span>
          <span style={styles.logoText}>Show Up 2 Move</span>
        </div>

        {/* Navigation Links */}
        <div style={styles.navLinks}>
          <button
            style={styles.navLink}
            onClick={() => navigate('/feed')}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
          >
            Feed
          </button>
          <button
            style={styles.navLink}
            onClick={() => navigate('/groups')}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
          >
            Groups
          </button>
          <button
            style={styles.navLink}
            onClick={() => navigate('/profile')}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
          >
            Profile
          </button>
          <button
            style={styles.navLink}
            onClick={() => navigate('/events/create')}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
          >
            Create Event
          </button>
        </div>

        {/* Right side: Notification Bell + User Menu */}
        <div style={styles.rightSection}>
          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <NotificationBell aiDegraded={aiDegraded} />
          </div>

          {/* User Menu */}
          <div style={{ position: 'relative' }}>
            <button
              style={styles.userButton}
              onClick={() => setShowUserMenu(!showUserMenu)}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#e5e7eb')}
            >
              <span style={styles.userIcon}>👤</span>
              <span style={styles.userName}>{displayName}</span>
            </button>

            {showUserMenu && (
              <div style={styles.userMenu}>
                <button
                  style={styles.menuItem}
                  onClick={() => {
                    setShowUserMenu(false)
                    navigate('/profile')
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                >
                  Edit Profile
                </button>
                <button
                  style={styles.menuItem}
                  onClick={handleLogout}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fee2e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  nav: {
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '64px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    userSelect: 'none',
  },
  logoIcon: {
    fontSize: '24px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  navLinks: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'center',
  },
  navLink: {
    background: 'none',
    border: 'none',
    color: '#4b5563',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '500',
    padding: '0.5rem 0.75rem',
    transition: 'color 0.2s',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#e5e7eb',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    padding: '0.5rem 1rem',
    transition: 'background 0.2s',
  },
  userIcon: {
    fontSize: '18px',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1f2937',
  },
  userMenu: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: '160px',
    overflow: 'hidden',
    zIndex: 1000,
  },
  menuItem: {
    width: '100%',
    background: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0.75rem 1rem',
    textAlign: 'left',
    transition: 'background 0.2s',
  },
}
