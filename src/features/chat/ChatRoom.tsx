// Feature: show-up-2-move
// Group chat UI with real-time messaging and emoji reactions
// Requirements: 9.3, 9.4, 9.5, 9.7, 8.5, 11.5, 12.2, 12.6

import { useState, useEffect, useRef } from 'react'
import { useGroupChat, Message } from './useGroupChat'
import { supabase } from '../../lib/supabaseClient'
import VenuePoll from './VenuePoll'
import { useLeaveGroup } from '../groups/useLeaveGroup'

interface ChatRoomProps {
  groupId: string
  /** Invoked after the current user successfully leaves the group. */
  onLeave?: () => void
}

interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
}

interface Group {
  id: string
  sport: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  captain_id: string | null
  event_id: string | null
}

interface VenueOption {
  name: string
  price_est: number | null
  distance_km: number | null
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥', '👏'] as const

/**
 * ChatRoom
 *
 * Full chat UI component with message display, input, and emoji reactions.
 * Includes captain-only coordination controls.
 *
 * Requirements:
 *  9.3 - System messages (join/leave/confirm) displayed in visually distinct style
 *  9.4 - Captain confirmation system messages
 *  9.5 - Message reactions using predefined emoji set
 *  9.7 - Empty state when no messages exist
 *  8.5 - Captain coordination actions (confirm event, propose venue, finalize location)
 *  11.5 - Venue finalization notifications
 *  12.2 - Event confirmation notifications
 *  12.6 - Venue update notifications
 */
export default function ChatRoom({ groupId, onLeave }: ChatRoomProps) {
  const { messages, loading, error, sendMessage } = useGroupChat(groupId)
  const { leaving, error: leaveError, leaveGroup } = useLeaveGroup()
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [isCaptain, setIsCaptain] = useState(false)
  const [showVenueForm, setShowVenueForm] = useState(false)
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([])
  const [loadingVenues, setLoadingVenues] = useState(false)
  const [finalizeForm, setFinalizeForm] = useState({
    location: '',
    startTime: '',
  })
  const [showFinalizeForm, setShowFinalizeForm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    fetchCurrentUser()
  }, [])

  // Fetch group information
  useEffect(() => {
    const fetchGroup = async () => {
      const { data, error: groupError } = await supabase
        .from('groups')
        .select('id, sport, status, captain_id, event_id')
        .eq('id', groupId)
        .single()

      if (!groupError && data) {
        setGroup(data)
        setIsCaptain(currentUserId !== null && data.captain_id === currentUserId)
      }
    }

    if (currentUserId) {
      fetchGroup()
    }
  }, [groupId, currentUserId])

  // Fetch profiles for all message senders
  useEffect(() => {
    const fetchProfiles = async () => {
      const senderIds = [
        ...new Set(
          messages
            .filter((msg) => msg.sender_id !== null)
            .map((msg) => msg.sender_id as string)
        ),
      ]

      if (senderIds.length === 0) return

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', senderIds)

      if (!profileError && data) {
        const profileMap: Record<string, Profile> = {}
        data.forEach((profile) => {
          profileMap[profile.id] = profile
        })
        setProfiles(profileMap)
      }
    }

    fetchProfiles()
  }, [messages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageInput.trim() || sending) return

    setSending(true)
    try {
      await sendMessage(messageInput)
      setMessageInput('')
    } finally {
      setSending(false)
    }
  }

  // Captain action: Confirm event (Requirement 8.5, 12.2)
  const handleConfirmEvent = async () => {
    if (!group || !group.event_id || !currentUserId) return

    try {
      // Update event status to 'confirmed'
      const { error: eventError } = await supabase
        .from('events')
        .update({ status: 'confirmed' })
        .eq('id', group.event_id)

      if (eventError) {
        console.error('Failed to confirm event:', eventError)
        return
      }

      // Update group status to 'confirmed'
      const { error: groupError } = await supabase
        .from('groups')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', groupId)

      if (groupError) {
        console.error('Failed to update group status:', groupError)
        return
      }

      // Insert system message
      await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: null,
        content: `${group.sport} match confirmed`,
        type: 'system',
      })

      // Get all group members
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)

      // Insert notifications for all group members
      if (members) {
        const notifications = members.map((member) => ({
          user_id: member.user_id,
          type: 'event_confirmed',
          title: 'Event Confirmed',
          body: `Your ${group.sport} match has been confirmed by the captain`,
          data: { group_id: groupId, event_id: group.event_id },
        }))

        await supabase.from('notifications').insert(notifications)
      }

      // Refresh group data
      const { data: updatedGroup } = await supabase
        .from('groups')
        .select('id, sport, status, captain_id, event_id')
        .eq('id', groupId)
        .single()

      if (updatedGroup) {
        setGroup(updatedGroup)
      }
    } catch (err) {
      console.error('Error confirming event:', err)
    }
  }

  // Captain action: Propose venue options (Requirement 8.5, 11.5)
  const handleProposeVenues = async () => {
    if (!group) return

    setLoadingVenues(true)
    setVenueOptions([])

    try {
      // Get group members count
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)

      const participantCount = members?.length || 0

      // Get captain's location
      const { data: profile } = await supabase
        .from('profiles')
        .select('location_lat, location_lng')
        .eq('id', currentUserId)
        .single()

      // Call venue-suggestions Edge Function
      // Note: This function may not exist yet (task 17), so we'll handle gracefully
      const { data, error } = await supabase.functions.invoke('venue-suggestions', {
        body: {
          sport: group.sport,
          participant_count: participantCount,
          location: {
            lat: profile?.location_lat || 0,
            lng: profile?.location_lng || 0,
          },
        },
      })

      if (error) {
        console.error('Failed to fetch venue suggestions:', error)
        // Show fallback message
        alert('AI venue suggestions are temporarily unavailable. Please enter venue details manually.')
        setShowVenueForm(false)
        setShowFinalizeForm(true)
        return
      }

      if (data && data.venues && data.venues.length > 0) {
        setVenueOptions(data.venues)
      } else {
        alert('No venue suggestions found. Please enter venue details manually.')
        setShowVenueForm(false)
        setShowFinalizeForm(true)
      }
    } catch (err) {
      console.error('Error fetching venues:', err)
      alert('Failed to fetch venue suggestions. Please enter venue details manually.')
      setShowVenueForm(false)
      setShowFinalizeForm(true)
    } finally {
      setLoadingVenues(false)
    }
  }

  // Captain action: Create venue poll from suggestions (Requirement 11.3)
  const handleCreatePoll = async () => {
    if (!group || !currentUserId || venueOptions.length === 0) return

    try {
      // Create the poll
      const { data: pollData, error: pollError } = await supabase
        .from('venue_polls')
        .insert({
          group_id: groupId,
          created_by: currentUserId,
          status: 'open',
        })
        .select()
        .single()

      if (pollError) {
        console.error('Failed to create poll:', pollError)
        alert('Failed to create poll. Please try again.')
        return
      }

      // Create poll options
      const options = venueOptions.map((venue) => ({
        poll_id: pollData.id,
        venue_name: venue.name,
        price_est: venue.price_est,
        distance_km: venue.distance_km,
        votes: 0,
      }))

      const { error: optionsError } = await supabase
        .from('venue_poll_options')
        .insert(options)

      if (optionsError) {
        console.error('Failed to create poll options:', optionsError)
        alert('Failed to create poll options. Please try again.')
        return
      }

      // Insert system message
      await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: null,
        content: 'Captain created a venue poll. Vote for your preferred location!',
        type: 'system',
      })

      // Reset state
      setShowVenueForm(false)
      setVenueOptions([])
      alert('Poll created successfully! Group members can now vote.')
    } catch (err) {
      console.error('Error creating poll:', err)
      alert('Failed to create poll. Please try again.')
    }
  }

  // Captain action: Finalize time and location (Requirement 8.5, 11.5, 12.6)
  const handleFinalizeLocation = async () => {
    if (!group || !group.event_id || !finalizeForm.location || !finalizeForm.startTime) {
      alert('Please fill in all fields')
      return
    }

    try {
      // Update event with finalized location and time
      const { error: eventError } = await supabase
        .from('events')
        .update({
          location_name: finalizeForm.location,
          start_time: finalizeForm.startTime,
        })
        .eq('id', group.event_id)

      if (eventError) {
        console.error('Failed to finalize location:', eventError)
        return
      }

      // Get all group members
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)

      // Insert notifications for all group members
      if (members) {
        const notifications = members.map((member) => ({
          user_id: member.user_id,
          type: 'venue_finalized',
          title: 'Venue Finalized',
          body: `Location: ${finalizeForm.location}, Time: ${new Date(finalizeForm.startTime).toLocaleString()}`,
          data: {
            group_id: groupId,
            event_id: group.event_id,
            location: finalizeForm.location,
            start_time: finalizeForm.startTime,
          },
        }))

        await supabase.from('notifications').insert(notifications)
      }

      // Insert system message
      await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: null,
        content: `Venue finalized: ${finalizeForm.location} at ${new Date(finalizeForm.startTime).toLocaleString()}`,
        type: 'system',
      })

      // Reset form and close
      setFinalizeForm({ location: '', startTime: '' })
      setShowFinalizeForm(false)
      setShowVenueForm(false)
    } catch (err) {
      console.error('Error finalizing location:', err)
    }
  }

  // Handle reaction toggle
  const handleReaction = async (messageId: string, emoji: string) => {
    if (!currentUserId) return

    const message = messages.find((m) => m.id === messageId)
    if (!message) return

    const reactions = { ...message.reactions }
    const userReactions = reactions[emoji] || []

    // Toggle reaction: add if not present, remove if present
    if (userReactions.includes(currentUserId)) {
      reactions[emoji] = userReactions.filter((id) => id !== currentUserId)
      if (reactions[emoji].length === 0) {
        delete reactions[emoji]
      }
    } else {
      reactions[emoji] = [...userReactions, currentUserId]
    }

    // Update message reactions in database
    const { error: updateError } = await supabase
      .from('messages')
      .update({ reactions })
      .eq('id', messageId)

    if (updateError) {
      console.error('Failed to update reaction:', updateError)
    }
  }

  // Leave group action (Requirement 16.2, 16.3)
  const handleLeaveGroup = async () => {
    if (leaving) return
    const confirmed = window.confirm(
      'Leave this group? You will be removed from the chat and any matched event.',
    )
    if (!confirmed) return

    const success = await leaveGroup(groupId)
    if (success) {
      onLeave?.()
    }
  }

  // Render message
  const renderMessage = (message: Message) => {
    const isSystem = message.type === 'system'
    const sender = message.sender_id ? profiles[message.sender_id] : null
    const isOwnMessage = message.sender_id === currentUserId

    if (isSystem) {
      // System messages styled differently (Requirement 9.3, 9.4)
      return (
        <div
          key={message.id}
          style={{
            padding: '0.75rem',
            margin: '0.5rem 0',
            background: '#f0f0f0',
            borderLeft: '3px solid #007bff',
            borderRadius: '4px',
            textAlign: 'center',
            color: '#555',
            fontSize: '0.9rem',
            fontStyle: 'italic',
          }}
        >
          {message.content}
        </div>
      )
    }

    // User messages
    return (
      <div
        key={message.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isOwnMessage ? 'flex-end' : 'flex-start',
          margin: '0.75rem 0',
        }}
      >
        {/* Sender name */}
        {!isOwnMessage && sender && (
          <div
            style={{
              fontSize: '0.85rem',
              color: '#666',
              marginBottom: '0.25rem',
              marginLeft: '0.5rem',
            }}
          >
            {sender.display_name}
          </div>
        )}

        {/* Message bubble */}
        <div
          style={{
            maxWidth: '70%',
            padding: '0.75rem 1rem',
            background: isOwnMessage ? '#007bff' : '#e9ecef',
            color: isOwnMessage ? '#fff' : '#333',
            borderRadius: '12px',
            wordWrap: 'break-word',
          }}
        >
          {message.content}
        </div>

        {/* Reactions (Requirement 9.5) */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          {/* Existing reactions */}
          {Object.entries(message.reactions).map(([emoji, userIds]) => {
            const hasReacted = userIds.includes(currentUserId || '')
            return (
              <button
                key={emoji}
                onClick={() => handleReaction(message.id, emoji)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: hasReacted ? '#007bff' : '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
                title={`${userIds.length} reaction${userIds.length > 1 ? 's' : ''}`}
              >
                <span>{emoji}</span>
                <span style={{ fontSize: '0.75rem', color: hasReacted ? '#fff' : '#666' }}>
                  {userIds.length}
                </span>
              </button>
            )
          })}

          {/* Add reaction button */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              style={{
                padding: '0.25rem 0.5rem',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: '12px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
              title="Add reaction"
            >
              +
            </button>
            {/* Reaction picker (simple hover menu) */}
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                display: 'none',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '0.5rem',
                gap: '0.25rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 10,
              }}
              className="reaction-picker"
            >
              {EMOJI_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(message.id, emoji)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                  }}
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timestamp */}
        <div
          style={{
            fontSize: '0.75rem',
            color: '#999',
            marginTop: '0.25rem',
            marginLeft: isOwnMessage ? '0' : '0.5rem',
            marginRight: isOwnMessage ? '0.5rem' : '0',
          }}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '600px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        background: '#fff',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem',
          borderBottom: '1px solid #ddd',
          background: '#f8f9fa',
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Group Chat</h2>
          {group && (
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
              {group.sport} • Status: {group.status}
              {isCaptain && <span style={{ marginLeft: '0.5rem', fontWeight: 'bold', color: '#007bff' }}>👑 Captain</span>}
            </div>
          )}
          {leaveError && (
            <div style={{ color: '#721c24', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {leaveError}
            </div>
          )}
        </div>
        {currentUserId && group && group.status !== 'cancelled' && group.status !== 'completed' && (
          <button
            type="button"
            onClick={handleLeaveGroup}
            disabled={leaving}
            title="Leave this group"
            style={{
              padding: '0.5rem 0.75rem',
              background: leaving ? '#ccc' : '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              cursor: leaving ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {leaving ? 'Leaving...' : '🚪 Leave Group'}
          </button>
        )}
      </div>

      {/* Captain Controls (Requirement 8.5) */}
      {isCaptain && group && group.status === 'pending' && (
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #ddd',
            background: '#fff3cd',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#856404', marginBottom: '0.5rem' }}>
            Captain Actions
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleConfirmEvent}
              style={{
                padding: '0.5rem 1rem',
                background: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              ✓ Confirm Event
            </button>

            <button
              onClick={() => {
                setShowVenueForm(!showVenueForm)
                if (!showVenueForm) {
                  handleProposeVenues()
                }
              }}
              disabled={loadingVenues}
              style={{
                padding: '0.5rem 1rem',
                background: loadingVenues ? '#ccc' : '#17a2b8',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: loadingVenues ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingVenues ? 'Loading...' : '📍 Propose Venues'}
            </button>

            <button
              onClick={() => setShowFinalizeForm(!showFinalizeForm)}
              style={{
                padding: '0.5rem 1rem',
                background: '#ffc107',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              🕐 Finalize Time & Location
            </button>
          </div>

          {/* Venue Options Display */}
          {showVenueForm && venueOptions.length > 0 && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Suggested Venues:
              </div>
              {venueOptions.map((venue, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.5rem',
                    marginBottom: '0.5rem',
                    background: '#f8f9fa',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{venue.name}</div>
                  {venue.price_est && (
                    <div style={{ color: '#666' }}>Price: ${venue.price_est.toFixed(2)}</div>
                  )}
                  {venue.distance_km && (
                    <div style={{ color: '#666' }}>Distance: {venue.distance_km.toFixed(1)} km</div>
                  )}
                </div>
              ))}
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                Use these suggestions to finalize the location below.
              </div>
            </div>
          )}

          {/* Finalize Form */}
          {showFinalizeForm && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Finalize Event Details:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Location name"
                  value={finalizeForm.location}
                  onChange={(e) =>
                    setFinalizeForm({ ...finalizeForm, location: e.target.value })
                  }
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                  }}
                />
                <input
                  type="datetime-local"
                  value={finalizeForm.startTime}
                  onChange={(e) =>
                    setFinalizeForm({ ...finalizeForm, startTime: e.target.value })
                  }
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleFinalizeLocation}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      background: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    Finalize
                  </button>
                  <button
                    onClick={() => setShowFinalizeForm(false)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#6c757d',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          background: '#fafafa',
        }}
      >
        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
            Loading messages...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            style={{
              padding: '1rem',
              background: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Venue Poll (Requirement 11.3, 11.4) */}
        <VenuePoll groupId={groupId} />

        {/* Captain controls */}
        {isCaptain && group?.status === 'pending' && (
          <div
            style={{
              padding: '1rem',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}
          >
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#856404' }}>
              👑 Captain Controls
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleConfirmEvent}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#28a745',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                ✓ Confirm Event
              </button>
              <button
                onClick={() => setShowVenueForm(true)}
                disabled={loadingVenues}
                style={{
                  padding: '0.5rem 1rem',
                  background: loadingVenues ? '#ccc' : '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loadingVenues ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                📍 Propose Venues
              </button>
              <button
                onClick={() => setShowFinalizeForm(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                📅 Finalize Location
              </button>
            </div>
          </div>
        )}

        {/* Venue suggestions modal */}
        {showVenueForm && (
          <div
            style={{
              padding: '1rem',
              background: '#fff',
              border: '2px solid #007bff',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}
          >
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>
              Venue Suggestions
            </h4>
            {loadingVenues ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                Loading venue suggestions...
              </div>
            ) : venueOptions.length > 0 ? (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  {venueOptions.map((venue, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.75rem',
                        background: '#f8f9fa',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {venue.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {venue.price_est !== null && `$${venue.price_est.toFixed(2)} • `}
                        {venue.distance_km !== null && `${venue.distance_km.toFixed(1)} km away`}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleCreatePoll}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    Create Poll
                  </button>
                  <button
                    onClick={() => {
                      setShowVenueForm(false)
                      setVenueOptions([])
                    }}
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#6c757d',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#666' }}>
                <button
                  onClick={handleProposeVenues}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#007bff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Get Venue Suggestions
                </button>
              </div>
            )}
          </div>
        )}

        {/* Finalize location form */}
        {showFinalizeForm && (
          <div
            style={{
              padding: '1rem',
              background: '#fff',
              border: '2px solid #007bff',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}
          >
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>
              Finalize Location & Time
            </h4>
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                Location:
              </label>
              <input
                type="text"
                value={finalizeForm.location}
                onChange={(e) =>
                  setFinalizeForm({ ...finalizeForm, location: e.target.value })
                }
                placeholder="Enter venue name or address"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem',
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                Start Time:
              </label>
              <input
                type="datetime-local"
                value={finalizeForm.startTime}
                onChange={(e) =>
                  setFinalizeForm({ ...finalizeForm, startTime: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleFinalizeLocation}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#28a745',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Finalize
              </button>
              <button
                onClick={() => {
                  setShowFinalizeForm(false)
                  setFinalizeForm({ location: '', startTime: '' })
                }}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Empty state (Requirement 9.7) */}
        {!loading && !error && messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#999',
              padding: '3rem 1rem',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#666' }}>
              No messages yet
            </h3>
            <p style={{ fontSize: '0.9rem' }}>
              Start the conversation with your group members!
            </p>
          </div>
        )}

        {/* Message list */}
        {!loading && !error && messages.length > 0 && (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSendMessage}
        style={{
          padding: '1rem',
          borderTop: '1px solid #ddd',
          background: '#fff',
          borderRadius: '0 0 8px 8px',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={sending || !messageInput.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              background: sending || !messageInput.trim() ? '#ccc' : '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: sending || !messageInput.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>

      {/* CSS for reaction picker hover */}
      <style>{`
        .reaction-picker:hover,
        button:hover + .reaction-picker {
          display: flex !important;
        }
      `}</style>
    </div>
  )
}
