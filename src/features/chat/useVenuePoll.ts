// Feature: show-up-2-move
// Hook for managing venue polls with live vote count updates via Realtime
// Requirements: 11.3, 11.4

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface VenuePollOption {
  id: string
  poll_id: string
  venue_name: string
  price_est: number | null
  distance_km: number | null
  votes: number
}

export interface VenuePoll {
  id: string
  group_id: string
  created_by: string
  status: 'open' | 'closed'
  created_at: string
}

export interface VenuePollWithOptions extends VenuePoll {
  options: VenuePollOption[]
}

export interface VoteCounts {
  [optionId: string]: number
}

/**
 * useVenuePoll
 *
 * Manages venue poll state and subscribes to live vote count updates via Realtime Broadcast.
 *
 * Requirements:
 *  11.3 - Venue poll creation and voting
 *  11.4 - Live vote count updates via Realtime
 */
export function useVenuePoll(groupId: string) {
  const [poll, setPoll] = useState<VenuePollWithOptions | null>(null)
  const [userVote, setUserVote] = useState<string | null>(null) // option_id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({})

  // Fetch active poll for the group
  const fetchPoll = async () => {
    try {
      setLoading(true)
      setError(null)

      // Get the most recent open poll for this group
      const { data: pollData, error: pollError } = await supabase
        .from('venue_polls')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pollError) {
        throw pollError
      }

      if (!pollData) {
        setPoll(null)
        setLoading(false)
        return
      }

      // Get poll options
      const { data: optionsData, error: optionsError } = await supabase
        .from('venue_poll_options')
        .select('*')
        .eq('poll_id', pollData.id)
        .order('id', { ascending: true })

      if (optionsError) {
        throw optionsError
      }

      // Get user's current vote
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: voteData } = await supabase
          .from('venue_poll_votes')
          .select('option_id')
          .eq('poll_id', pollData.id)
          .eq('user_id', user.id)
          .maybeSingle()

        setUserVote(voteData?.option_id || null)
      }

      // Initialize vote counts from options
      const counts: VoteCounts = {}
      optionsData?.forEach((option) => {
        counts[option.id] = option.votes
      })
      setVoteCounts(counts)

      setPoll({
        ...pollData,
        options: optionsData || [],
      })
    } catch (err) {
      console.error('Error fetching venue poll:', err)
      setError(err instanceof Error ? err.message : 'Failed to load poll')
    } finally {
      setLoading(false)
    }
  }

  // Cast a vote
  const castVote = async (optionId: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || !poll) {
        throw new Error('User not authenticated or poll not loaded')
      }

      // Insert or update vote (UNIQUE constraint handles replacement)
      const { error: voteError } = await supabase.from('venue_poll_votes').upsert(
        {
          poll_id: poll.id,
          option_id: optionId,
          user_id: user.id,
        },
        {
          onConflict: 'poll_id,user_id',
        }
      )

      if (voteError) {
        throw voteError
      }

      // Update local state
      setUserVote(optionId)

      // Recalculate vote counts from database
      const { data: allVotes } = await supabase
        .from('venue_poll_votes')
        .select('option_id')
        .eq('poll_id', poll.id)

      if (allVotes) {
        const newCounts: VoteCounts = {}
        poll.options.forEach((option) => {
          newCounts[option.id] = 0
        })
        allVotes.forEach((vote) => {
          newCounts[vote.option_id] = (newCounts[vote.option_id] || 0) + 1
        })
        setVoteCounts(newCounts)

        // Broadcast updated vote counts to all group members
        const channel = supabase.channel(`group:${groupId}:poll`)
        await channel.send({
          type: 'broadcast',
          event: 'vote_update',
          payload: { voteCounts: newCounts },
        })
      }
    } catch (err) {
      console.error('Error casting vote:', err)
      setError(err instanceof Error ? err.message : 'Failed to cast vote')
    }
  }

  // Subscribe to live vote count updates via Realtime Broadcast (Requirement 11.4)
  useEffect(() => {
    if (!groupId) return

    let channel: RealtimeChannel | null = null

    const setupRealtimeSubscription = async () => {
      // Subscribe to the poll broadcast channel
      channel = supabase.channel(`group:${groupId}:poll`)

      channel
        .on('broadcast', { event: 'vote_update' }, (payload) => {
          // Update vote counts when broadcast is received
          if (payload.payload?.voteCounts) {
            setVoteCounts(payload.payload.voteCounts)
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Subscribed to group:${groupId}:poll channel`)
          }
        })
    }

    setupRealtimeSubscription()

    // Cleanup subscription on unmount
    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [groupId])

  // Fetch poll on mount
  useEffect(() => {
    fetchPoll()
  }, [groupId])

  return {
    poll,
    userVote,
    voteCounts,
    loading,
    error,
    castVote,
    refetchPoll: fetchPoll,
  }
}
