import { useCallback, useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface Message {
  id: string
  group_id: string
  sender_id: string | null
  content: string
  type: 'user' | 'system'
  reactions: Record<string, string[]>
  created_at: string
}

interface UseGroupChatReturn {
  messages: Message[]
  loading: boolean
  error: string | null
  /** Send a new user message to the group chat */
  sendMessage: (content: string) => Promise<void>
  /** Refresh messages from the database */
  refresh: () => Promise<void>
}

/**
 * useGroupChat
 *
 * Encapsulates message persistence, retrieval, and real-time updates for a group's chat room.
 *
 * - On mount, fetches the last 50 messages ordered by `created_at ASC`.
 *   (Requirement 9.6)
 * - `sendMessage` inserts a new message with `sender_id = auth.uid()` and
 *   `type='user'`. (Requirement 9.2)
 * - Subscribes to `group:{group_id}:messages` channel for real-time message delivery.
 *   (Requirement 9.2, 9.6)
 * - On reconnect, re-fetches the last 50 messages to ensure consistency.
 * - When the group chat room has no messages, the frontend should display
 *   an empty state message. (Requirement 9.7)
 */
export function useGroupChat(groupId: string): UseGroupChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    setError(null)

    try {
      // Fetch the last 50 messages ordered by created_at ASC (Requirement 9.6)
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
        .limit(50)

      if (fetchError) {
        setError('Failed to load messages.')
        return
      }

      setMessages(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Set up Realtime subscription for live message updates (Requirement 9.2, 9.6)
  useEffect(() => {
    if (!groupId) return

    // Create a channel for this specific group's messages
    const channel = supabase.channel(`group:${groupId}:messages`)

    // Subscribe to Postgres Changes on the messages table
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          // Append incoming message to local state
          const newMessage = payload.new as Message
          setMessages((prev) => {
            // Avoid duplicates by checking if message already exists
            if (prev.some((msg) => msg.id === newMessage.id)) {
              return prev
            }
            // Keep only the last 50 messages
            const updated = [...prev, newMessage]
            return updated.slice(-50)
          })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to group:${groupId}:messages`)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Error subscribing to group:${groupId}:messages`)
          setError('Real-time connection error. Messages may be delayed.')
        } else if (status === 'TIMED_OUT') {
          console.warn(`Subscription timed out for group:${groupId}:messages`)
        } else if (status === 'CLOSED') {
          console.log(`Channel closed for group:${groupId}:messages, reconnecting...`)
          // On reconnect, re-fetch last 50 messages to ensure consistency
          fetchMessages()
        }
      })

    channelRef.current = channel

    // Cleanup: unsubscribe when component unmounts or groupId changes
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [groupId, fetchMessages])

  /**
   * Send a new user message to the group chat.
   * Inserts a message with sender_id = auth.uid() and type='user'.
   * (Requirement 9.2)
   * 
   * Note: We don't manually refresh after sending because the Realtime
   * subscription will automatically deliver the new message to all connected clients.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        setError('Message content cannot be empty.')
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Get the current authenticated user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) {
          setError('You must be logged in to send messages.')
          return
        }

        // Insert the message with sender_id = auth.uid() and type='user'
        const { error: insertError } = await supabase.from('messages').insert({
          group_id: groupId,
          sender_id: user.id,
          content: content.trim(),
          type: 'user',
        })

        if (insertError) {
          setError('Failed to send message. Please try again.')
          return
        }

        // No need to manually refresh - Realtime subscription will handle it
      } finally {
        setLoading(false)
      }
    },
    [groupId],
  )

  return {
    messages,
    loading,
    error,
    sendMessage,
    refresh: fetchMessages,
  }
}
