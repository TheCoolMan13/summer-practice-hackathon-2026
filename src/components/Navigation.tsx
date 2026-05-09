// Feature: show-up-2-move
// Top navigation bar with logo, primary links, notification bell, and user menu.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from '../features/notifications/NotificationBell'
import { useAIHealth } from '../lib/aiHealth'
import { colors, gradients, radii, shadows } from '../lib/theme'

interface NavItem {
  label: string
  path: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Feed', path: '/feed', icon: '🔥' },
  { label: 'Groups', path: '/groups', icon: '💬' },
  { label: 'Create', path: '/events/create', icon: '＋' },
  { label: 'Profile', path: '/profile', icon: '👤' },
]

export default function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [displayName, setDisplayName] = useState('Player')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { isDegraded: aiDegraded } = useAIHealth()

  useEffect(() => {
    let cancelled = false
    async function loadUserProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (profile?.display_name) setDisplayName(profile.display_name)
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url)
    }
    loadUserProfile()
    return () => { cancelled = true }
  }, [])

  // Close user menu on navigation
  useEffect(() => {
    setShowUserMenu(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === '/feed') return location.pathname === '/' || location.pathname.startsWith('/feed')
    return location.pathname.startsWith(path)
  }

  return (
    <nav style={styles.nav} aria-label="Primary">
      <div style={styles.container}>
        {/* Brand */}
        <button
          type="button"
          onClick={() => navigate('/feed')}
          style={styles.logoButton}
          aria-label="ShowUp2Move home"
        >
          <span style={styles.logoMark} aria-hidden="true">⚡</span>
          <span style={styles.logoWordmark}>
            ShowUp<span style={styles.logoAccent}>2</span>Move
          </span>
        </button>

        {/* Primary nav */}
        <ul style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)
            return (
              <li key={item.path}>
                <button
                  type="button"
                  onClick={() => navigate(item.path)}
                  style={{
                    ...styles.navLink,
                    ...(active ? styles.navLinkActive : {}),
                  }}
                >
                  <span aria-hidden="true" style={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* Right side */}
        <div style={styles.rightSection}>
          <NotificationBell aiDegraded={aiDegraded} />

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={styles.userButton}
              onClick={() => setShowUserMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={styles.userAvatar} />
              ) : (
                <span style={styles.userInitial} aria-hidden="true">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span style={styles.userName}>{displayName}</span>
              <span style={styles.chevron} aria-hidden="true">▾</span>
            </button>

            {showUserMenu && (
              <div role="menu" style={styles.userMenu}>
                <button
                  type="button"
                  role="menuitem"
                  style={styles.menuItem}
                  onClick={() => navigate('/profile')}
                >
                  <span aria-hidden="true">👤</span>
                  Edit profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  style={{ ...styles.menuItem, ...styles.menuItemDanger }}
                  onClick={handleLogout}
                >
                  <span aria-hidden="true">↪</span>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'rgba(255, 255, 255, 0.82)',
    backdropFilter: 'saturate(180%) blur(20px)',
    WebkitBackdropFilter: 'saturate(180%) blur(20px)',
    borderBottom: `1px solid ${colors.ink[200]}`,
  },
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    height: 68,
  },
  logoButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: radii.md,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    background: gradients.brandStrong,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 700,
    boxShadow: shadows.sm,
  },
  logoWordmark: {
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: colors.ink[900],
  },
  logoAccent: { color: colors.accent[500] },

  navList: {
    display: 'flex',
    gap: 4,
    listStyle: 'none',
    padding: 0,
    margin: 0,
    flex: 1,
    justifyContent: 'center',
  },
  navLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    border: 'none',
    background: 'transparent',
    borderRadius: radii.pill,
    color: colors.ink[600],
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease',
  },
  navLinkActive: {
    background: colors.brand[50],
    color: colors.brand[700],
  },
  navIcon: { fontSize: 15, lineHeight: 1 },

  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  userButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 10px 4px 4px',
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.pill,
    cursor: 'pointer',
    transition: 'box-shadow 0.15s ease, transform 0.15s ease',
    boxShadow: shadows.xs,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  userInitial: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: gradients.brandStrong,
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
  },
  userName: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.ink[800],
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: { fontSize: 11, color: colors.ink[500] },
  userMenu: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    minWidth: 200,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.md,
    boxShadow: shadows.lg,
    padding: 6,
    zIndex: 100,
    animation: 's2m-fade-in 0.18s ease-out both',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    background: 'transparent',
    borderRadius: radii.sm,
    fontSize: 14,
    fontWeight: 500,
    color: colors.ink[800],
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s ease',
  },
  menuItemDanger: {
    color: colors.danger[700],
  },
}
