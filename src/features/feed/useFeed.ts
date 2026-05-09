// Feature: show-up-2-move
// Feed data layer hook
// Requirements: 5.1, 5.2, 5.3, 5.4

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { haversineDistanceKm, isWithinRadius } from './feedUtils'

// ─── Public types ────────────────────────────────────────────────────────────

export interface FeedFilters {
  /** Filter by sport type (Requirement 5.2) */
  sport?: string
  /** Distance filter radius in kilometres (Requirement 5.3) */
  radiusKm?: number
  /** User's latitude — required when radiusKm is set */
  userLat?: number
  /** User's longitude — required when radiusKm is set */
  userLng?: number
  /** Only show events starting within the next N hours (Requirement 5.4) */
  timeWindowHours?: number
}

export interface FeedEvent {
  id: string
  sport: string
  title: string | null
  description: string | null
  organizer_id: string
  /** Display name of the organizer / captain (Requirement 5.1) */
  organizer_display_name: string
  group_id: string | null
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  start_time: string
  participant_limit: number
  /** Current number of active (non-cancelled) participants (Requirement 5.1) */
  participant_count: number
  skill_requirement: string | null
  price_per_person: number | null
  status: string
  source: string
  created_at: string
  /** Whether the currently authenticated user has joined this event (Requirement 5.1) */
  user_is_participant: boolean
  /** Distance from the user's location in km; null when user location is unavailable */
  distance_km: number | null
}

export interface UseFeedReturn {
  events: FeedEvent[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// ─── Raw PostgREST row shape ──────────────────────────────────────────────────

interface RawEventRow {
  id: string
  sport: string
  title: string | null
  description: string | null
  organizer_id: string
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
  // Joined relation: profiles!organizer_id
  profiles: { display_name: string } | null
  // Joined relation: event_participants (all rows for this event)
  event_participants: Array<{ user_id: string; status: string }>
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useFeed
 *
 * Fetches open events from the `events` table via PostgREST, applies the
 * provided filters, and returns a sorted list of FeedEvent objects.
 *
 * Filter application order:
 *  1. Sport filter  — applied server-side via PostgREST `.eq()` (Req 5.2)
 *  2. Time window   — applied server-side via PostgREST `.lte()` (Req 5.4)
 *  3. Distance      — applied client-side using Haversine (Req 5.3)
 *     PostgREST does not expose ST_DWithin from the browser client, so
 *     distance filtering is performed after the data is fetched.
 *
 * Events are sorted by `start_time ASC` (Requirement 5.1).
 */
export function useFeed(filters: FeedFilters = {}): UseFeedReturn {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── 1. Resolve the current user ID for participation status ──────────
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const currentUserId = user?.id ?? null

      // ── 2. Build the PostgREST query ─────────────────────────────────────
      let query = supabase
        .from('events')
        .select(
          `
          *,
          profiles!organizer_id ( display_name ),
          event_participants ( user_id, status )
        `,
        )
        .eq('status', 'open') // only show open events
        .order('start_time', { ascending: true }) // Requirement 5.1: sorted by start_time ASC

      // ── 3. Server-side sport filter (Requirement 5.2) ────────────────────
      if (filters.sport) {
        query = query.eq('sport', filters.sport)
      }

      // ── 4. Server-side time window filter (Requirement 5.4) ──────────────
      if (filters.timeWindowHours !== undefined && filters.timeWindowHours > 0) {
        const futureTime = new Date(
          Date.now() + filters.timeWindowHours * 60 * 60 * 1000,
        ).toISOString()
        query = query.lte('start_time', futureTime)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        setError('Failed to load events. Please try again.')
        return
      }

      const rows = (data ?? []) as RawEventRow[]

      // ── 5. Client-side distance filter + enrichment (Requirement 5.3) ────
      const enriched: FeedEvent[] = []

      for (const row of rows) {
        // Distance filter
        if (
          !isWithinRadius(
            filters.userLat,
            filters.userLng,
            row.location_lat,
            row.location_lng,
            filters.radiusKm,
          )
        ) {
          continue
        }

        // Compute distance_km for display purposes
        let distance_km: number | null = null
        if (
          filters.userLat !== undefined &&
          filters.userLng !== undefined &&
          row.location_lat !== null &&
          row.location_lng !== null
        ) {
          distance_km = haversineDistanceKm(
            filters.userLat,
            filters.userLng,
            row.location_lat,
            row.location_lng,
          )
        }

        // Count active (non-cancelled) participants
        const activeParticipants = (row.event_participants ?? []).filter(
          (p) => p.status !== 'cancelled',
        )
        const participant_count = activeParticipants.length

        // Determine whether the current user has joined
        const user_is_participant =
          currentUserId !== null &&
          activeParticipants.some((p) => p.user_id === currentUserId)

        // Resolve organizer display name from the joined profiles relation
        const organizer_display_name =
          row.profiles?.display_name ?? 'Unknown'

        enriched.push({
          id: row.id,
          sport: row.sport,
          title: row.title,
          description: row.description,
          organizer_id: row.organizer_id,
          organizer_display_name,
          group_id: row.group_id,
          location_name: row.location_name,
          location_lat: row.location_lat,
          location_lng: row.location_lng,
          start_time: row.start_time,
          participant_limit: row.participant_limit,
          participant_count,
          skill_requirement: row.skill_requirement,
          price_per_person: row.price_per_person,
          status: row.status,
          source: row.source,
          created_at: row.created_at,
          user_is_participant,
          distance_km,
        })
      }

      // Events are already sorted by start_time ASC from the server query,
      // but re-sort after client-side filtering to guarantee order is preserved.
      enriched.sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      )

      setEvents(enriched)
    } finally {
      setLoading(false)
    }
  }, [
    filters.sport,
    filters.radiusKm,
    filters.userLat,
    filters.userLng,
    filters.timeWindowHours,
  ])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return { events, loading, error, refetch: fetchEvents }
}
