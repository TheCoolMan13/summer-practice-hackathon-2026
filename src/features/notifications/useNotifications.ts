// Feature: show-up-2-move
// Notification data layer hook
// Requirements: 12.1, 12.2, 12.3, 12.4, 12.6

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Public types ────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: string | null
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refetch: () => Promise<void>
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useNotifications
 *
 * Fetches notifications for the current user from the `notifications` table
 * and subscribes to real-time updates via Supabase Realtime.
 *
 * Real-time subscription:
 *  - Subscribes to `user:{user_id}:notifications` channel (DB Changes on `notifications`)
 *  - Delivers new notifications within 3 seconds (Requirements 12.1, 12.2, 12.4)
 *
 * Features:
 *  - Fetch unread notifications on mount
 *  - Mark individual notifications as read
 *  - Mark all notifications as read
 *  - Real-time delivery of new notifications
 */
export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  // ── Fetch notifications ──────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('User not authenticated')
        setNotifications([])
        return
      }

      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError('Failed to load notifications. Please try again.')
        return
      }

      setNotifications((data ?? []) as Notification[])
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Mark notification as read ────────────────────────────────────────────
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)

      if (updateError) {
        console.error('Failed to mark notification as read:', updateError)
        return
      }

      // Optimistically update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
      )
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }, [])

  // ── Mark all notifications as read ───────────────────────────────────────
  const markAllAsRead = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)

      if (updateError) {
        console.error('Failed to mark all notifications as read:', updateError)
        return
      }

      // Optimistically update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (err) {
      console.error('Error marking all notifications as read:', err)
    }
  }, [])

  // ── Set up Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    const setupRealtimeSubscription = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || !mounted) return

      // Subscribe to DB Changes on notifications table for this user
      const realtimeChannel = supabase
        .channel(`user:${user.id}:notifications`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Add new notification to the top of the list
            const newNotification = payload.new as Notification
            setNotifications((prev) => [newNotification, ...prev])
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Update existing notification
            const updatedNotification = payload.new as Notification
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === updatedNotification.id ? updatedNotification : n,
              ),
            )
          },
        )
        .subscribe()

      setChannel(realtimeChannel)
    }

    setupRealtimeSubscription()

    return () => {
      mounted = false
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, []) // Empty dependency array — set up once on mount

  // ── Initial fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // ── Compute unread count ─────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  }
}
