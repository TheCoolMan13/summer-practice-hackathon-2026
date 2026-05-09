// Feature: show-up-2-move
// Event action hooks — join, leave, etc.
// Requirements: 5.6, 10.4, 10.5

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export interface JoinEventResult {
  success: boolean
  error?: string
  isFull?: boolean
}

/**
 * useEventActions
 *
 * Provides actions for interacting with events:
 *  - joinEvent: Add the current user to an event's participant list
 *
 * Requirement 5.6: On "Join" tap, INSERT into event_participants
 * Requirement 10.4: Handle join requests and notify organizer
 * Requirement 10.5: Reject join when participant_limit is reached
 */
export function useEventActions() {
  const [loading, setLoading] = useState(false)

  /**
   * joinEvent
   *
   * Attempts to add the current user to the event's participant list.
   *
   * Flow:
   *  1. Fetch the event and count active participants
   *  2. If participant_count >= participant_limit, reject with isFull=true
   *  3. INSERT into event_participants with status='joined'
   *  4. INSERT notification for the organizer
   *  5. If event becomes full, UPDATE event status to 'full'
   *
   * @param eventId - The UUID of the event to join
   * @returns JoinEventResult with success flag and optional error/isFull
   */
  const joinEvent = async (eventId: string): Promise<JoinEventResult> => {
    setLoading(true)
    try {
      // ── 1. Get current user ──────────────────────────────────────────────
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return { success: false, error: 'You must be logged in to join an event' }
      }

      // ── 2. Fetch event details and current participants ──────────────────
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select(
          `
          id,
          organizer_id,
          participant_limit,
          status,
          sport,
          title,
          start_time,
          profiles!organizer_id ( display_name ),
          event_participants!inner ( user_id, status )
        `,
        )
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        return { success: false, error: 'Event not found' }
      }

      // ── 3. Check if event is already full (Requirement 10.5) ─────────────
      const activeParticipants = (event.event_participants ?? []).filter(
        (p: { status: string }) => p.status !== 'cancelled',
      )

      if (activeParticipants.length >= event.participant_limit) {
        return { success: false, isFull: true, error: 'Event is full' }
      }

      // ── 4. Check if user is already a participant ────────────────────────
      const alreadyJoined = activeParticipants.some(
        (p: { user_id: string }) => p.user_id === user.id,
      )

      if (alreadyJoined) {
        return { success: false, error: 'You have already joined this event' }
      }

      // ── 5. Insert into event_participants (Requirement 5.6) ──────────────
      const { error: insertError } = await supabase
        .from('event_participants')
        .insert({
          event_id: eventId,
          user_id: user.id,
          status: 'joined',
        })

      if (insertError) {
        // Handle unique constraint violation (race condition)
        if (insertError.code === '23505') {
          return { success: false, error: 'You have already joined this event' }
        }
        return { success: false, error: 'Failed to join event. Please try again.' }
      }

      // ── 6. Notify organizer (Requirement 10.4) ───────────────────────────
      const { error: notifError } = await supabase.from('notifications').insert({
        user_id: event.organizer_id,
        type: 'event_join',
        title: 'New participant joined',
        body: `Someone joined your ${event.sport} event${event.title ? ` "${event.title}"` : ''} on ${new Date(event.start_time).toLocaleDateString()}`,
        data: {
          event_id: eventId,
          participant_id: user.id,
        },
      })

      // Non-blocking: log notification error but don't fail the join
      if (notifError) {
        console.error('Failed to notify organizer:', notifError)
      }

      // ── 7. Check if event is now full and update status ──────────────────
      const newParticipantCount = activeParticipants.length + 1
      if (newParticipantCount >= event.participant_limit) {
        const { error: updateError } = await supabase
          .from('events')
          .update({ status: 'full' })
          .eq('id', eventId)

        // Non-blocking: log update error but don't fail the join
        if (updateError) {
          console.error('Failed to update event status to full:', updateError)
        }
      }

      return { success: true }
    } catch (err) {
      console.error('Unexpected error joining event:', err)
      return { success: false, error: 'An unexpected error occurred' }
    } finally {
      setLoading(false)
    }
  }

  return { joinEvent, loading }
}
