// Feature: show-up-2-move
// Home feed page — event discovery and join
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.4, 10.5

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed, FeedFilters } from './useFeed'
import { useEventActions } from './useEventActions'

/**
 * FeedPage
 *
 * Displays the home feed of upcoming sports events with filtering controls
 * and join functionality.
 *
 * Requirements:
 *  5.1 - Display events sorted by start time with participant count and organizer
 *  5.2 - Sport filter
 *  5.3 - Distance filter
 *  5.4 - Time window filter
 *  5.5 - Empty state when no events match filters
 *  5.6 - Join event action
 *  10.4 - Notify organizer when user joins
 *  10.5 - Handle full event rejection
 */
export default function FeedPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<FeedFilters>({})
  const { events, loading, error, refetch } = useFeed(filters)
  const { joinEvent, loading: joiningEvent } = useEventActions()
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null)

  // ── Filter handlers ────────────────────────────────────────────────────────

  const handleSportFilterChange = (sport: string) => {
    setFilters((prev) => ({
      ...prev,
      sport: sport === 'all' ? undefined : sport,
    }))
  }

  const handleDistanceFilterChange = (radiusKm: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      radiusKm,
    }))
  }

  const handleTimeWindowChange = (hours: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      timeWindowHours: hours,
    }))
  }

  // ── Join event handler ─────────────────────────────────────────────────────

  const handleJoinEvent = async (eventId: string) => {
    setJoinError(null)
    setJoinSuccess(null)

    const result = await joinEvent(eventId)

    if (result.success) {
      setJoinSuccess('Successfully joined the event!')
      // Refetch to update participant counts and user_is_participant status
      await refetch()
    } else if (result.isFull) {
      setJoinError('Event is full')
    } else {
      setJoinError(result.error ?? 'Failed to join event')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto', background: 'white', minHeight: 'calc(100vh - 64px)' }}>
      <h1>Home Feed</h1>

      {/* Filter controls */}
      <section style={{ marginBottom: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Filters</h2>

        {/* Sport filter (Requirement 5.2) */}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="sport-filter" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Sport:
          </label>
          <select
            id="sport-filter"
            value={filters.sport ?? 'all'}
            onChange={(e) => handleSportFilterChange(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }}
          >
            <option value="all">All Sports</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="tennis">Tennis</option>
            <option value="volleyball">Volleyball</option>
          </select>
        </div>

        {/* Distance filter (Requirement 5.3) */}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="distance-filter" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Distance (km):
          </label>
          <select
            id="distance-filter"
            value={filters.radiusKm ?? 'all'}
            onChange={(e) => handleDistanceFilterChange(e.target.value === 'all' ? undefined : Number(e.target.value))}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }}
          >
            <option value="all">Any Distance</option>
            <option value="5">Within 5 km</option>
            <option value="10">Within 10 km</option>
            <option value="25">Within 25 km</option>
            <option value="50">Within 50 km</option>
          </select>
        </div>

        {/* Time window filter (Requirement 5.4) */}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="time-filter" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Starting within:
          </label>
          <select
            id="time-filter"
            value={filters.timeWindowHours ?? 'all'}
            onChange={(e) => handleTimeWindowChange(e.target.value === 'all' ? undefined : Number(e.target.value))}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }}
          >
            <option value="all">Any Time</option>
            <option value="24">Next 24 hours</option>
            <option value="48">Next 2 days</option>
            <option value="168">Next week</option>
          </select>
        </div>
      </section>

      {/* Status messages */}
      {joinSuccess && (
        <div style={{ padding: '1rem', background: '#d4edda', color: '#155724', borderRadius: '4px', marginBottom: '1rem' }}>
          {joinSuccess}
        </div>
      )}
      {joinError && (
        <div style={{ padding: '1rem', background: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '1rem' }}>
          {joinError}
        </div>
      )}
      {error && (
        <div style={{ padding: '1rem', background: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && <p>Loading events...</p>}

      {/* Empty state (Requirement 5.5) */}
      {!loading && events.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#f9f9f9', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>No events found</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            No upcoming events match your current filters.
          </p>
          <p style={{ color: '#666' }}>
            Try adjusting your filters or create your own event to get started!
          </p>
        </div>
      )}

      {/* Event list (Requirement 5.1) */}
      {!loading && events.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
            Upcoming Events ({events.length})
          </h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {events.map((event) => {
              const startDate = new Date(event.start_time)
              const isEventFull = event.participant_count >= event.participant_limit

              return (
                <article
                  key={event.id}
                  style={{
                    padding: '1.5rem',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  {/* Event header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>
                        {event.title || `${event.sport.charAt(0).toUpperCase() + event.sport.slice(1)} Match`}
                      </h3>
                      <p style={{ color: '#666', fontSize: '0.9rem' }}>
                        Organized by {event.organizer_display_name}
                      </p>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: '#007bff',
                        color: '#fff',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                      }}
                    >
                      {event.sport.toUpperCase()}
                    </span>
                  </div>

                  {/* Event details */}
                  <div style={{ marginBottom: '1rem', color: '#333' }}>
                    <p style={{ marginBottom: '0.5rem' }}>
                      <strong>📅 When:</strong> {startDate.toLocaleString()}
                    </p>
                    {event.location_name && (
                      <p style={{ marginBottom: '0.5rem' }}>
                        <strong>📍 Where:</strong> {event.location_name}
                        {event.distance_km !== null && ` (${event.distance_km.toFixed(1)} km away)`}
                      </p>
                    )}
                    <p style={{ marginBottom: '0.5rem' }}>
                      <strong>👥 Participants:</strong> {event.participant_count} / {event.participant_limit}
                      {isEventFull && <span style={{ color: '#dc3545', marginLeft: '0.5rem' }}>(FULL)</span>}
                    </p>
                    {event.skill_requirement && (
                      <p style={{ marginBottom: '0.5rem' }}>
                        <strong>🎯 Skill Level:</strong> {event.skill_requirement}
                      </p>
                    )}
                    {event.price_per_person !== null && event.price_per_person > 0 && (
                      <p style={{ marginBottom: '0.5rem' }}>
                        <strong>💰 Cost:</strong> ${event.price_per_person.toFixed(2)} per person
                      </p>
                    )}
                    {event.description && (
                      <p style={{ marginTop: '1rem', color: '#555', fontStyle: 'italic' }}>
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Join button (Requirements 5.6, 10.5) */}
                  <div onClick={(e) => e.stopPropagation()}>
                    {event.user_is_participant ? (
                      <button
                        disabled
                        style={{
                          padding: '0.75rem 1.5rem',
                          background: '#28a745',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          cursor: 'not-allowed',
                          opacity: 0.7,
                        }}
                      >
                        ✓ Joined
                      </button>
                    ) : isEventFull ? (
                      <button
                        disabled
                        style={{
                          padding: '0.75rem 1.5rem',
                          background: '#6c757d',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          cursor: 'not-allowed',
                        }}
                      >
                        Event is Full
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoinEvent(event.id)}
                        disabled={joiningEvent}
                        style={{
                          padding: '0.75rem 1.5rem',
                          background: '#007bff',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          cursor: joiningEvent ? 'wait' : 'pointer',
                          opacity: joiningEvent ? 0.7 : 1,
                        }}
                      >
                        {joiningEvent ? 'Joining...' : 'Join Event'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
