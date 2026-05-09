import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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
 * Encapsulates message persistence and retrieval for a group's chat room.
 *
 * - On mount, fetches the last 50 messages ordered by `created_at ASC`.
 *   (Requirement 9.6)
 * - `sendMessage` inserts a new message with `sender_id = auth.uid()` and
 *   `type='user'`. (Requirement 9.2)
 * - When the group chat room has no messages, the frontend should display
 *   an empty state message. (Requirement 9.7)
 */
export function useGroupChat(groupId: string): UseGroupChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  /**
   * Send a new user message to the group chat.
   * Inserts a message with sender_id = auth.uid() and type='user'.
   * (Requirement 9.2)
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

        // Refresh messages to include the newly sent message
        await fetchMessages()
      } finally {
        setLoading(false)
      }
    },
    [groupId, fetchMessages],
  )

  return {
    messages,
    loading,
    error,
    sendMessage,
    refresh: fetchMessages,
  }
}
