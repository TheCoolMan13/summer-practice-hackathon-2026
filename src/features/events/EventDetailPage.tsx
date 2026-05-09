// Feature: show-up-2-move
// Event detail page with map view and live participant updates
// Requirements: 10.6, 11.6, 13.1

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { LatLng } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventDetail {
  id: string
  sport: string
  title: string | null
  description: string | null
  organizer_id: string
  organizer_display_name: string
  group_id: string | null
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  start_time: string
  participant_limit: number
  skill_requirement: string | null
  price_per_person: number | null
  status: string
  source: string
  created_at: string
}

interface Participant {
  id: string
  user_id: string
  status: 'joined' | 'confirmed' | 'cancelled'
  joined_at: string
  display_name: string
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * EventDetailPage
 *
 * Displays full event details including:
 *  - All event fields (sport, location, time, description, etc.)
 *  - Participant list with live count updates via Supabase Realtime
 *  - Embedded Leaflet map showing event location
 *  - Cancel participation button
 *
 * Requirements:
 *  10.6 - Cancel participation: UPDATE event_participants.status = 'cancelled'
 *  11.6 - Display event location on embedded map
 *  13.1 - Show event location on map
 *
 * Realtime subscription:
 *  - Subscribes to 'feed' channel for live participant count updates
 *  - Updates participant list when changes occur
 */
export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingParticipation, setCancellingParticipation] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null)

  // ── Load event and participants ────────────────────────────────────────────

  const fetchEventData = async () => {
    if (!eventId) {
      setError('Event ID is missing')
      setLoading(false)
      return
    }

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)

      // Fetch event details with organizer profile
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select(
          `
          *,
          profiles!organizer_id ( display_name )
        `,
        )
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError
      if (!eventData) throw new Error('Event not found')

      // Type assertion for the joined relation
      const rawEvent = eventData as any

      setEvent({
        id: rawEvent.id,
        sport: rawEvent.sport,
        title: rawEvent.title,
        description: rawEvent.description,
        organizer_id: rawEvent.organizer_id,
        organizer_display_name: rawEvent.profiles?.display_name ?? 'Unknown',
        group_id: rawEvent.group_id,
        location_name: rawEvent.location_name,
        location_lat: rawEvent.location_lat,
        location_lng: rawEvent.location_lng,
        start_time: rawEvent.start_time,
        participant_limit: rawEvent.participant_limit,
        skill_requirement: rawEvent.skill_requirement,
        price_per_person: rawEvent.price_per_person,
        status: rawEvent.status,
        source: rawEvent.source,
        created_at: rawEvent.created_at,
      })

      // Fetch participants with their profiles
      const { data: participantsData, error: participantsError } = await supabase
        .from('event_participants')
        .select(
          `
          id,
          user_id,
          status,
          joined_at,
          profiles!user_id ( display_name )
        `,
        )
        .eq('event_id', eventId)
        .neq('status', 'cancelled')
        .order('joined_at', { ascending: true })

      if (participantsError) throw participantsError

      // Type assertion and map to Participant type
      const rawParticipants = (participantsData ?? []) as any[]
      const mappedParticipants: Participant[] = rawParticipants.map((p) => ({
        id: p.id,
        user_id: p.user_id,
        status: p.status,
        joined_at: p.joined_at,
        display_name: p.profiles?.display_name ?? 'Unknown',
      }))

      setParticipants(mappedParticipants)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load event details'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEventData()
  }, [eventId])

  // ── Realtime subscription for live participant updates ─────────────────────

  useEffect(() => {
    if (!eventId) return

    // Subscribe to the 'feed' channel for live updates
    // (Design specifies 'feed' channel for home feed live updates)
    const channel: RealtimeChannel = supabase
      .channel('feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Refetch participants when any change occurs
          fetchEventData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId])

  // ── Cancel participation handler ───────────────────────────────────────────

  const handleCancelParticipation = async () => {
    if (!currentUserId || !eventId) return

    setCancelError(null)
    setCancelSuccess(null)
    setCancellingParticipation(true)

    try {
      // Requirement 10.6: UPDATE event_participants.status = 'cancelled'
      const { error: updateError } = await supabase
        .from('event_participants')
        .update({ status: 'cancelled' })
        .eq('event_id', eventId)
        .eq('user_id', currentUserId)

      if (updateError) throw updateError

      setCancelSuccess('Successfully cancelled your participation')

      // Refresh participant list
      await fetchEventData()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel participation'
      setCancelError(message)
    } finally {
      setCancellingParticipation(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.loadingContainer} aria-live="polite" aria-label="Loading">
        Loading event details…
      </div>
    )
  }

  if (error || !event) {
    return (
      <div style={styles.errorContainer}>
        <h1 style={styles.errorTitle}>Error</h1>
        <p style={styles.errorText}>{error ?? 'Event not found'}</p>
        <button style={styles.backButton} onClick={() => navigate('/feed')}>
          Back to Feed
        </button>
      </div>
    )
  }

  const startDate = new Date(event.start_time)
  const activeParticipantCount = participants.length
  const isUserParticipant = participants.some((p) => p.user_id === currentUserId)
  const isEventFull = activeParticipantCount >= event.participant_limit

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <button style={styles.backButton} onClick={() => navigate('/feed')}>
            ← Back to Feed
          </button>
          <span
            style={{
              ...styles.sportBadge,
              backgroundColor: getSportColor(event.sport),
            }}
          >
            {event.sport.toUpperCase()}
          </span>
        </div>

        {/* Title */}
        <h1 style={styles.title}>
          {event.title || `${event.sport.charAt(0).toUpperCase() + event.sport.slice(1)} Match`}
        </h1>

        {/* Status messages */}
        {cancelSuccess && (
          <div style={styles.successBox} role="alert">
            {cancelSuccess}
          </div>
        )}
        {cancelError && (
          <div style={styles.errorBox} role="alert">
            {cancelError}
          </div>
        )}

        {/* Event details section */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Event Details</h2>

          <div style={styles.detailGrid}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>📅 When:</span>
              <span style={styles.detailValue}>{startDate.toLocaleString()}</span>
            </div>

            {event.location_name && (
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>📍 Where:</span>
                <span style={styles.detailValue}>{event.location_name}</span>
              </div>
            )}

            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>👤 Organizer:</span>
              <span style={styles.detailValue}>{event.organizer_display_name}</span>
            </div>

            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>👥 Participants:</span>
              <span style={styles.detailValue}>
                {activeParticipantCount} / {event.participant_limit}
                {isEventFull && <span style={styles.fullBadge}> FULL</span>}
              </span>
            </div>

            {event.skill_requirement && (
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>🎯 Skill Level:</span>
                <span style={styles.detailValue}>
                  {event.skill_requirement.charAt(0).toUpperCase() +
                    event.skill_requirement.slice(1)}
                </span>
              </div>
            )}

            {event.price_per_person !== null && event.price_per_person > 0 && (
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>💰 Cost:</span>
                <span style={styles.detailValue}>€{event.price_per_person.toFixed(2)} per person</span>
              </div>
            )}

            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>📋 Status:</span>
              <span style={styles.detailValue}>
                {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
              </span>
            </div>

            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>🔖 Type:</span>
              <span style={styles.detailValue}>
                {event.source === 'manual' ? 'Manually Created' : 'Auto-Matched'}
              </span>
            </div>
          </div>

          {event.description && (
            <div style={styles.descriptionBox}>
              <h3 style={styles.descriptionTitle}>Description</h3>
              <p style={styles.descriptionText}>{event.description}</p>
            </div>
          )}
        </section>

        {/* Map section (Requirements 11.6, 13.1) */}
        {event.location_lat !== null && event.location_lng !== null && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Location Map</h2>
            <div style={styles.mapContainer}>
              <MapContainer
                center={[event.location_lat, event.location_lng]}
                zoom={15}
                style={{ height: '400px', width: '100%', borderRadius: '8px' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={new LatLng(event.location_lat, event.location_lng)} />
              </MapContainer>
            </div>
            <p style={styles.coordinatesText}>
              Coordinates: {event.location_lat.toFixed(5)}, {event.location_lng.toFixed(5)}
            </p>
          </section>
        )}

        {/* Participants section */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            Participants ({activeParticipantCount}/{event.participant_limit})
          </h2>

          {participants.length === 0 ? (
            <p style={styles.emptyText}>No participants yet. Be the first to join!</p>
          ) : (
            <ul style={styles.participantList}>
              {participants.map((participant) => (
                <li key={participant.id} style={styles.participantItem}>
                  <span style={styles.participantName}>
                    {participant.display_name}
                    {participant.user_id === event.organizer_id && (
                      <span style={styles.organizerBadge}> (Organizer)</span>
                    )}
                    {participant.user_id === currentUserId && (
                      <span style={styles.youBadge}> (You)</span>
                    )}
                  </span>
                  <span style={styles.participantStatus}>
                    {participant.status === 'confirmed' ? '✓ Confirmed' : 'Joined'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Cancel participation button (Requirement 10.6) */}
        {isUserParticipant && (
          <section style={styles.section}>
            <button
              onClick={handleCancelParticipation}
              disabled={cancellingParticipation}
              style={{
                ...styles.cancelButton,
                ...(cancellingParticipation ? styles.cancelButtonDisabled : {}),
              }}
              aria-busy={cancellingParticipation}
            >
              {cancellingParticipation ? 'Cancelling…' : 'Cancel My Participation'}
            </button>
            <p style={styles.cancelHint}>
              This will update your status to cancelled and free up a spot for others.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function getSportColor(sport: string): string {
  const colors: Record<string, string> = {
    football: '#28a745',
    basketball: '#fd7e14',
    tennis: '#ffc107',
    volleyball: '#17a2b8',
  }
  return colors[sport.toLowerCase()] ?? '#007bff'
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#718096',
    fontSize: '1rem',
  },
  errorContainer: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  errorTitle: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#e53e3e',
    marginBottom: '1rem',
  },
  errorText: {
    fontSize: '1rem',
    color: '#718096',
    marginBottom: '2rem',
  },
  container: {
    minHeight: '100vh',
    backgroundColor: '#f0f4f8',
    padding: '2rem 1rem',
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '900px',
    alignSelf: 'flex-start',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  backButton: {
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    color: '#2d3748',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    padding: '0.5rem 1rem',
    transition: 'background-color 0.15s',
  },
  sportBadge: {
    padding: '0.5rem 1rem',
    color: '#fff',
    borderRadius: '20px',
    fontSize: '0.85rem',
    fontWeight: 'bold',
  },
  title: {
    margin: '0 0 1.5rem',
    fontSize: '2rem',
    fontWeight: 700,
    color: '#1a202c',
  },
  section: {
    marginBottom: '2rem',
    paddingBottom: '2rem',
    borderBottom: '1px solid #e2e8f0',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#2d3748',
    marginBottom: '1rem',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  detailLabel: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#718096',
  },
  detailValue: {
    fontSize: '1rem',
    color: '#2d3748',
  },
  fullBadge: {
    color: '#e53e3e',
    fontWeight: 600,
    fontSize: '0.85rem',
  },
  descriptionBox: {
    marginTop: '1.5rem',
    padding: '1rem',
    backgroundColor: '#f7fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  descriptionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#2d3748',
    marginBottom: '0.5rem',
  },
  descriptionText: {
    fontSize: '0.95rem',
    color: '#4a5568',
    lineHeight: '1.6',
    margin: 0,
  },
  mapContainer: {
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #cbd5e0',
  },
  coordinatesText: {
    color: '#718096',
    fontSize: '0.8rem',
    margin: '0.5rem 0 0',
    fontFamily: 'monospace',
  },
  participantList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  participantItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
    marginBottom: '0.5rem',
    border: '1px solid #e2e8f0',
  },
  participantName: {
    fontSize: '1rem',
    color: '#2d3748',
    fontWeight: 500,
  },
  participantStatus: {
    fontSize: '0.875rem',
    color: '#718096',
  },
  organizerBadge: {
    color: '#3182ce',
    fontWeight: 600,
    fontSize: '0.85rem',
  },
  youBadge: {
    color: '#38a169',
    fontWeight: 600,
    fontSize: '0.85rem',
  },
  emptyText: {
    color: '#718096',
    fontSize: '0.95rem',
    fontStyle: 'italic',
  },
  cancelButton: {
    backgroundColor: '#e53e3e',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '0.75rem 1.5rem',
    width: '100%',
    transition: 'background-color 0.15s',
  },
  cancelButtonDisabled: {
    backgroundColor: '#fc8181',
    cursor: 'not-allowed',
  },
  cancelHint: {
    color: '#718096',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#d4edda',
    border: '1px solid #c3e6cb',
    borderRadius: '6px',
    color: '#155724',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    color: '#c53030',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
  },
}
