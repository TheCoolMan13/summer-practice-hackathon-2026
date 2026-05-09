// Feature: show-up-2-move
// Notification bell UI component
// Requirements: 12.1, 14.5

import { useEffect, useRef, useState } from 'react'
import { useNotifications } from './useNotifications'
import { colors, radii, shadows } from '../../lib/theme'

export interface NotificationBellProps {
  onAIDegraded?: () => void
  aiDegraded?: boolean
}

export default function NotificationBell({ onAIDegraded, aiDegraded = false }: NotificationBellProps) {
  const { notifications, unreadCount, loading, error, markAsRead, markAllAsRead } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const [showAIToast, setShowAIToast] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (aiDegraded) {
      setShowAIToast(true)
      onAIDegraded?.()
      const timer = setTimeout(() => setShowAIToast(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [aiDegraded, onAIDegraded])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    const diffMs = Date.now() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        style={{
          ...styles.bellBtn,
          ...(isOpen ? styles.bellBtnActive : {}),
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 16v-5a6 6 0 0 0-4-5.66V4a2 2 0 1 0-4 0v1.34A6 6 0 0 0 6 11v5l-2 2h16l-2-2Z"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          />
          <path
            d="M10 20a2 2 0 0 0 4 0"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span style={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={styles.dropdown} className="s2m-fade-in">
          <div style={styles.header}>
            <h3 style={styles.headerTitle}>Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} style={styles.markAllBtn}>
                Mark all read
              </button>
            )}
          </div>

          <div style={styles.list}>
            {loading && <div style={styles.centered}>Loading notifications…</div>}
            {error && <div style={{ ...styles.centered, color: colors.danger[700] }}>{error}</div>}
            {!loading && !error && notifications.length === 0 && (
              <div style={styles.empty}>
                <div style={{ fontSize: 40 }}>📭</div>
                <p style={{ margin: 0 }}>You're all caught up.</p>
              </div>
            )}

            {!loading && !error && notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markAsRead(n.id)}
                style={{
                  ...styles.item,
                  ...(n.read ? {} : styles.itemUnread),
                }}
              >
                <div style={styles.itemHeader}>
                  <h4 style={{ ...styles.itemTitle, fontWeight: n.read ? 500 : 700 }}>
                    {n.title}
                  </h4>
                  {!n.read && <span style={styles.unreadDot} aria-hidden="true" />}
                </div>
                <p style={styles.itemBody}>{n.body}</p>
                <span style={styles.itemTime}>{formatTimestamp(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showAIToast && (
        <div style={styles.toast} role="status" className="s2m-fade-in">
          <span style={styles.toastIcon} aria-hidden="true">✨</span>
          <div style={{ flex: 1 }}>
            <h4 style={styles.toastTitle}>AI features temporarily unavailable</h4>
            <p style={styles.toastBody}>
              Core functionality still works — we'll resume suggestions automatically.
            </p>
          </div>
          <button onClick={() => setShowAIToast(false)} style={styles.toastClose} aria-label="Close">×</button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bellBtn: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40, height: 40,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: '50%',
    color: colors.ink[700],
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    boxShadow: shadows.xs,
  },
  bellBtnActive: {
    background: colors.brand[50],
    borderColor: colors.brand[200],
    color: colors.brand[700],
  },
  badge: {
    position: 'absolute',
    top: -2, right: -2,
    minWidth: 18, height: 18,
    padding: '0 5px',
    background: colors.danger[500],
    color: '#fff',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid ${colors.surface}`,
    boxShadow: shadows.sm,
  },

  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: 380,
    maxHeight: 520,
    background: colors.surface,
    border: `1px solid ${colors.ink[200]}`,
    borderRadius: radii.lg,
    boxShadow: shadows.lg,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 18px',
    borderBottom: `1px solid ${colors.ink[200]}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { margin: 0, fontSize: 15, fontWeight: 700 },
  markAllBtn: {
    background: 'transparent',
    border: 'none',
    color: colors.brand[600],
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: {
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  centered: { padding: 24, textAlign: 'center', color: colors.ink[500], fontSize: 14 },
  empty: {
    padding: '48px 24px',
    textAlign: 'center',
    color: colors.ink[500],
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },

  item: {
    width: '100%',
    padding: '14px 18px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderBottom: `1px solid ${colors.ink[100]}`,
    textAlign: 'left',
    transition: 'background 0.15s ease',
    display: 'block',
  },
  itemUnread: { background: colors.brand[50] },
  itemHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  itemTitle: { margin: 0, fontSize: 14, color: colors.ink[900] },
  unreadDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: colors.brand[500],
    flexShrink: 0, marginTop: 6,
  },
  itemBody: {
    margin: '4px 0 6px',
    fontSize: 13,
    color: colors.ink[600],
    lineHeight: 1.45,
  },
  itemTime: { fontSize: 12, color: colors.ink[400] },

  toast: {
    position: 'fixed',
    bottom: 24, right: 24,
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 16px',
    background: colors.surface,
    border: `1px solid ${colors.warning[300]}`,
    borderLeft: `3px solid ${colors.warning[500]}`,
    borderRadius: radii.md,
    boxShadow: shadows.lg,
    maxWidth: 360,
    zIndex: 2000,
  },
  toastIcon: { fontSize: 18 },
  toastTitle: { margin: 0, fontSize: 13, fontWeight: 700, color: colors.warning[900] },
  toastBody: { margin: '4px 0 0', fontSize: 12, color: colors.ink[600], lineHeight: 1.5 },
  toastClose: {
    background: 'transparent', border: 'none',
    color: colors.ink[500], fontSize: 18,
    cursor: 'pointer', lineHeight: 1, padding: 0,
  },
}
