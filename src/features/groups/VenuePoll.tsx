// Feature: show-up-2-move
// Venue poll creation and voting component
// Requirements: 11.3, 11.4

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

interface VenuePollProps {
  groupId: string
  onClose?: () => void
}

interface VenueOption {
  venue_name: string
  price_est: number | null
  distance_km: number | null
}

interface PollOption {
  id: string
  venue_name: string
  price_est: number | null
  distance_km: number | null
  votes: number
}

interface Poll {
  id: string
  status: 'open' | 'closed'
  created_at: string
  options: PollOption[]
}

/**
 * VenuePoll
 *
 * Component for creating venue polls and voting on venue options.
 * Only the captain can create polls; all group members can vote.
 *
 * Requirements:
 *  11.3 - Captain proposes venue options to the group via poll
 *  11.4 - Group members vote on venue poll; live vote counts displayed
 *
 * Database operations:
 *  - INSERT into venue_polls (captain only)
 *  - INSERT into venue_poll_options (captain only)
 *  - INSERT into venue_poll_votes (UNIQUE constraint enforces one vote per user per poll)
 */
export default function VenuePoll({ groupId, onClose }: VenuePollProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCaptain, setIsCaptain] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePoll, setActivePoll] = useState<Poll | null>(null)
  const [userVote, setUserVote] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [voting, setVoting] = useState(false)

  // Form state for creating a new poll
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([
    { venue_name: '', price_est: null, distance_km: null },
  ])

  // Fetch current user and check if captain
  useEffect(() => {
    const fetchUserAndGroup = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setError('You must be logged in to view this poll')
          setLoading(false)
          return
        }
        setCurrentUserId(user.id)

        // Check if user is captain
        const { data: group, error: groupError } = await supabase
          .from('groups')
          .select('captain_id')
          .eq('id', groupId)
          .single()

        if (groupError) {
          setError('Failed to load group information')
          setLoading(false)
          return
        }

        setIsCaptain(group.captain_id === user.id)
        setLoading(false)
      } catch (err) {
        console.error('Error fetching user/group:', err)
        setError('Failed to load user information')
        setLoading(false)
      }
    }

    fetchUserAndGroup()
  }, [groupId])

  // Fetch active poll for this group
  useEffect(() => {
    const fetchActivePoll = async () => {
      try {
        // Get the most recent open poll for this group
        const { data: polls, error: pollError } = await supabase
          .from('venue_polls')
          .select('id, status, created_at')
          .eq('group_id', groupId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1)

        if (pollError) {
          console.error('Error fetching poll:', pollError)
          return
        }

        if (polls && polls.length > 0) {
          const poll = polls[0]

          // Fetch poll options
          const { data: options, error: optionsError } = await supabase
            .from('venue_poll_options')
            .select('id, venue_name, price_est, distance_km, votes')
            .eq('poll_id', poll.id)

          if (optionsError) {
            console.error('Error fetching poll options:', optionsError)
            return
          }

          setActivePoll({
            id: poll.id,
            status: poll.status,
            created_at: poll.created_at,
            options: options || [],
          })

          // Check if current user has voted
          if (currentUserId) {
            const { data: vote } = await supabase
              .from('venue_poll_votes')
              .select('option_id')
              .eq('poll_id', poll.id)
              .eq('user_id', currentUserId)
              .single()

            if (vote) {
              setUserVote(vote.option_id)
            }
          }
        }
      } catch (err) {
        console.error('Error fetching active poll:', err)
      }
    }

    if (currentUserId) {
      fetchActivePoll()
    }
  }, [groupId, currentUserId])

  // Add a new venue option to the form
  const handleAddVenueOption = () => {
    setVenueOptions([
      ...venueOptions,
      { venue_name: '', price_est: null, distance_km: null },
    ])
  }

  // Remove a venue option from the form
  const handleRemoveVenueOption = (index: number) => {
    if (venueOptions.length > 1) {
      setVenueOptions(venueOptions.filter((_, i) => i !== index))
    }
  }

  // Update a venue option in the form
  const handleUpdateVenueOption = (
    index: number,
    field: keyof VenueOption,
    value: string | number | null
  ) => {
    const updated = [...venueOptions]
    updated[index] = { ...updated[index], [field]: value }
    setVenueOptions(updated)
  }

  // Create a new poll (captain only)
  const handleCreatePoll = async () => {
    if (!isCaptain || !currentUserId) {
      setError('Only the captain can create polls')
      return
    }

    // Validate that all venue options have names
    const validOptions = venueOptions.filter((opt) => opt.venue_name.trim() !== '')
    if (validOptions.length === 0) {
      setError('Please add at least one venue option')
      return
    }

    setCreating(true)
    setError(null)

    try {
      // Insert poll
      const { data: poll, error: pollError } = await supabase
        .from('venue_polls')
        .insert({
          group_id: groupId,
          created_by: currentUserId,
          status: 'open',
        })
        .select()
        .single()

      if (pollError) {
        throw new Error(`Failed to create poll: ${pollError.message}`)
      }

      // Insert poll options
      const optionsToInsert = validOptions.map((opt) => ({
        poll_id: poll.id,
        venue_name: opt.venue_name,
        price_est: opt.price_est,
        distance_km: opt.distance_km,
        votes: 0,
      }))

      const { error: optionsError } = await supabase
        .from('venue_poll_options')
        .insert(optionsToInsert)

      if (optionsError) {
        throw new Error(`Failed to create poll options: ${optionsError.message}`)
      }

      // Insert system message in group chat
      await supabase.from('messages').insert({
        group_id: groupId,
        sender_id: null,
        content: 'Captain created a venue poll. Vote for your preferred venue!',
        type: 'system',
      })

      // Refresh the active poll
      const { data: options } = await supabase
        .from('venue_poll_options')
        .select('id, venue_name, price_est, distance_km, votes')
        .eq('poll_id', poll.id)

      setActivePoll({
        id: poll.id,
        status: poll.status,
        created_at: poll.created_at,
        options: options || [],
      })

      // Reset form
      setVenueOptions([{ venue_name: '', price_est: null, distance_km: null }])
    } catch (err) {
      console.error('Error creating poll:', err)
      setError(err instanceof Error ? err.message : 'Failed to create poll')
    } finally {
      setCreating(false)
    }
  }

  // Vote on a poll option
  const handleVote = async (optionId: string) => {
    if (!currentUserId || !activePoll) return

    setVoting(true)
    setError(null)

    try {
      // Check if user has already voted
      const { data: existingVote } = await supabase
        .from('venue_poll_votes')
        .select('id, option_id')
        .eq('poll_id', activePoll.id)
        .eq('user_id', currentUserId)
        .single()

      if (existingVote) {
        // User has already voted - update their vote
        if (existingVote.option_id === optionId) {
          // Clicking the same option - do nothing
          setVoting(false)
          return
        }

        // Decrement old option vote count
        const oldOption = activePoll.options.find((opt) => opt.id === existingVote.option_id)
        if (oldOption) {
          await supabase
            .from('venue_poll_options')
            .update({ votes: Math.max(0, oldOption.votes - 1) })
            .eq('id', existingVote.option_id)
        }

        // Delete old vote
        await supabase.from('venue_poll_votes').delete().eq('id', existingVote.id)
      }

      // Insert new vote
      const { error: voteError } = await supabase.from('venue_poll_votes').insert({
        poll_id: activePoll.id,
        option_id: optionId,
        user_id: currentUserId,
      })

      if (voteError) {
        throw new Error(`Failed to vote: ${voteError.message}`)
      }

      // Increment new option vote count
      const newOption = activePoll.options.find((opt) => opt.id === optionId)
      if (newOption) {
        await supabase
          .from('venue_poll_options')
          .update({ votes: newOption.votes + 1 })
          .eq('id', optionId)
      }

      // Update local state
      setUserVote(optionId)

      // Refresh poll options to get updated vote counts
      const { data: updatedOptions } = await supabase
        .from('venue_poll_options')
        .select('id, venue_name, price_est, distance_km, votes')
        .eq('poll_id', activePoll.id)

      if (updatedOptions) {
        setActivePoll({
          ...activePoll,
          options: updatedOptions,
        })
      }
    } catch (err) {
      console.error('Error voting:', err)
      setError(err instanceof Error ? err.message : 'Failed to vote')
    } finally {
      setVoting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading poll...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          background: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          margin: '1rem',
        }}
      >
        {error}
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '1.5rem',
        background: '#fff',
        borderRadius: '8px',
        border: '1px solid #ddd',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Venue Poll</h2>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Active poll - voting interface */}
      {activePoll && (
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Vote for your preferred venue</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activePoll.options.map((option) => {
              const isUserVote = userVote === option.id
              const totalVotes = activePoll.options.reduce((sum, opt) => sum + opt.votes, 0)
              const votePercentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0

              return (
                <div
                  key={option.id}
                  style={{
                    padding: '1rem',
                    border: `2px solid ${isUserVote ? '#007bff' : '#ddd'}`,
                    borderRadius: '8px',
                    background: isUserVote ? '#e7f3ff' : '#fff',
                    cursor: voting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => !voting && handleVote(option.id)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {option.venue_name}
                        {isUserVote && (
                          <span style={{ marginLeft: '0.5rem', color: '#007bff', fontSize: '0.9rem' }}>
                            ✓ Your vote
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>
                        {option.price_est !== null && `€${option.price_est.toFixed(2)} per person`}
                        {option.price_est !== null && option.distance_km !== null && ' • '}
                        {option.distance_km !== null && `${option.distance_km.toFixed(1)} km away`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#007bff' }}>
                        {option.votes}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {option.votes === 1 ? 'vote' : 'votes'}
                      </div>
                    </div>
                  </div>

                  {/* Vote percentage bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      background: '#e9ecef',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${votePercentage}%`,
                        height: '100%',
                        background: isUserVote ? '#007bff' : '#28a745',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create poll interface (captain only) */}
      {!activePoll && isCaptain && (
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Create a venue poll</h3>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Add venue options for your group to vote on. Include at least one venue.
          </p>

          {venueOptions.map((option, index) => (
            <div
              key={index}
              style={{
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '8px',
                marginBottom: '1rem',
                background: '#f8f9fa',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Venue {index + 1}</h4>
                {venueOptions.length > 1 && (
                  <button
                    onClick={() => handleRemoveVenueOption(index)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#dc3545',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                    Venue Name *
                  </label>
                  <input
                    type="text"
                    value={option.venue_name}
                    onChange={(e) => handleUpdateVenueOption(index, 'venue_name', e.target.value)}
                    placeholder="e.g., City Sports Center"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      Price per person (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={option.price_est ?? ''}
                      onChange={(e) =>
                        handleUpdateVenueOption(
                          index,
                          'price_est',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      placeholder="e.g., 15.00"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      Distance (km)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={option.distance_km ?? ''}
                      onChange={(e) =>
                        handleUpdateVenueOption(
                          index,
                          'distance_km',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      placeholder="e.g., 2.5"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '1rem',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              onClick={handleAddVenueOption}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              + Add Another Venue
            </button>

            <button
              onClick={handleCreatePoll}
              disabled={creating}
              style={{
                padding: '0.75rem 1.5rem',
                background: creating ? '#ccc' : '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: creating ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              {creating ? 'Creating Poll...' : 'Create Poll'}
            </button>
          </div>
        </div>
      )}

      {/* No active poll and not captain */}
      {!activePoll && !isCaptain && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No active venue poll</h3>
          <p style={{ fontSize: '0.9rem' }}>
            The captain will create a venue poll when ready.
          </p>
        </div>
      )}
    </div>
  )
}
