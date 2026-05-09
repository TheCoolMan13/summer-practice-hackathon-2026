// Feature: show-up-2-move
// Notification bell UI component
// Requirements: 12.1, 14.5

import { useState, useRef, useEffect } from 'react'
import { useNotifications } from './useNotifications'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface NotificationBellProps {
  /** Optional callback when AI features are degraded */
  onAIDegraded?: () => void
  /** Whether AI features are currently degraded (for showing toast) */
  aiDegraded?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * NotificationBell
 *
 * Displays a notification bell icon with an unread badge count and a dropdown
 * inbox showing recent notifications.
 *
 * Features:
 *  - Unread badge count (Requirement 12.1)
 *  - Dropdown inbox with notification list
 *  - Mark individual notifications as read
 *  - Mark all notifications as read
 *  - Non-blocking toast when AI features are degraded (Requirement 14.5)
 *
 * The component uses a simple dropdown pattern with click-outside detection
 * to close the inbox when the user clicks elsewhere.
 */
export default function NotificationBell({
  onAIDegraded,
  aiDegraded = false,
}: NotificationBellProps) {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
  } = useNotifications()

  const [isOpen, setIsOpen] = useState(false)
  const [showAIToast, setShowAIToast] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Handle AI degradation toast ──────────────────────────────────────────
  useEffect(() => {
    if (aiDegraded) {
      setShowAIToast(true)
      onAIDegraded?.()

      // Auto-hide toast after 5 seconds
      const timer = setTimeout(() => {
        setShowAIToast(false)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [aiDegraded, onAIDegraded])

  // ── Click outside to close dropdown ──────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // ── Toggle dropdown ──────────────────────────────────────────────────────
  const toggleDropdown = () => {
    setIsOpen((prev) => !prev)
  }

  // ── Handle notification click ────────────────────────────────────────────
  const handleNotificationClick = async (notificationId: string) => {
    await markAsRead(notificationId)
  }

  // ── Handle mark all as read ──────────────────────────────────────────────
  const handleMarkAllAsRead = async () => {
    await markAllAsRead()
  }

  // ── Format timestamp ─────────────────────────────────────────────────────
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
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
    <div className="notification-bell-container" ref={dropdownRef}>
      {/* ── Bell icon with badge ────────────────────────────────────────── */}
      <button
        className="notification-bell-button"
        onClick={toggleDropdown}
        aria-label={`Notifications (${unreadCount} unread)`}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          fontSize: '24px',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            className="notification-badge"
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown inbox ──────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="notification-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            width: '360px',
            maxHeight: '480px',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Header ────────────────────────────────────────────────── */}
          <div
            className="notification-header"
            style={{
              padding: '16px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* ── Notification list ──────────────────────────────────────── */}
          <div
            className="notification-list"
            style={{
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {loading && (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                Loading notifications...
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#ef4444',
                }}
              >
                {error}
              </div>
            )}

            {!loading && !error && notifications.length === 0 && (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  color: '#6b7280',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  📭
                </div>
                <p style={{ margin: 0 }}>No notifications yet</p>
              </div>
            )}

            {!loading &&
              !error &&
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="notification-item"
                  onClick={() => handleNotificationClick(notification.id)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background: notification.read ? 'white' : '#eff6ff',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = notification.read
                      ? '#f9fafb'
                      : '#dbeafe'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = notification.read
                      ? 'white'
                      : '#eff6ff'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '4px',
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: notification.read ? 'normal' : 'bold',
                        color: '#111827',
                      }}
                    >
                      {notification.title}
                    </h4>
                    {!notification.read && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#3b82f6',
                          flexShrink: 0,
                          marginLeft: '8px',
                        }}
                      />
                    )}
                  </div>
                  <p
                    style={{
                      margin: '4px 0',
                      fontSize: '13px',
                      color: '#6b7280',
                      lineHeight: '1.4',
                    }}
                  >
                    {notification.body}
                  </p>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#9ca3af',
                    }}
                  >
                    {formatTimestamp(notification.created_at)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── AI degradation toast ────────────────────────────────────────── */}
      {showAIToast && (
        <div
          className="ai-degradation-toast"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '8px',
            padding: '16px',
            maxWidth: '360px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <h4
              style={{
                margin: '0 0 4px 0',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#92400e',
              }}
            >
              AI features temporarily unavailable
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#78350f',
                lineHeight: '1.4',
              }}
            >
              Some features may be limited. Core functionality remains
              available.
            </p>
          </div>
          <button
            onClick={() => setShowAIToast(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#92400e',
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
