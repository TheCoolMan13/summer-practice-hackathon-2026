import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export type Sport = 'football' | 'basketball' | 'tennis' | 'volleyball'

export interface AvailabilityRecord {
  id: string
  user_id: string
  is_available: boolean
  preferred_start: string | null
  preferred_end: string | null
  expires_at: string
  created_at: string
  sports: Sport[]
}

interface UseAvailabilityReturn {
  availability: AvailabilityRecord | null
  loading: boolean
  error: string | null
  /** Declare availability as "Yes" with optional time window and sports */
  declareAvailable: (opts: {
    preferredStart?: string
    preferredEnd?: string
    sports: Sport[]
  }) => Promise<void>
  /** Declare availability as "No" */
  declareUnavailable: () => Promise<void>
  /** Refresh the current availability record from the database */
  refresh: () => Promise<void>
}

/**
 * useAvailability
 *
 * Encapsulates all fetch and upsert logic for the availability feature.
 *
 * - On mount, fetches the current availability record for the given userId.
 * - `declareAvailable` upserts an availability record with `is_available=true`
 *   and `expires_at = NOW() + 8 hours`, then upserts the selected sports into
 *   `availability_sports`. (Requirements 6.1, 6.3, 6.5)
 * - `declareUnavailable` sets `is_available=false`. (Requirement 6.2)
 */
export function useAvailability(userId: string): UseAvailabilityReturn {
  const [availability, setAvailability] = useState<AvailabilityRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAvailability = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('availability')
        .select('*, availability_sports(sport)')
        .eq('user_id', userId)
        .maybeSingle()

      if (fetchError) {
        setError('Failed to load availability status.')
        return
      }

      if (!data) {
        setAvailability(null)
        return
      }

      // Flatten the nested availability_sports join into a plain sports array
      const sports: Sport[] = (
        (data.availability_sports as Array<{ sport: string }>) ?? []
      ).map((row) => row.sport as Sport)

      setAvailability({
        id: data.id,
        user_id: data.user_id,
        is_available: data.is_available,
        preferred_start: data.preferred_start ?? null,
        preferred_end: data.preferred_end ?? null,
        expires_at: data.expires_at,
        created_at: data.created_at,
        sports,
      })
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchAvailability()
  }, [fetchAvailability])

  /**
   * Declare the user as available.
   * Upserts the availability row and replaces the availability_sports rows.
   * Must complete within 1 second under normal load (Requirement 6.5).
   */
  const declareAvailable = useCallback(
    async ({
      preferredStart,
      preferredEnd,
      sports,
    }: {
      preferredStart?: string
      preferredEnd?: string
      sports: Sport[]
    }) => {
      setLoading(true)
      setError(null)

      try {
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()

        // Upsert the availability record (UNIQUE constraint on user_id)
        const { data: upsertedRow, error: upsertError } = await supabase
          .from('availability')
          .upsert(
            {
              user_id: userId,
              is_available: true,
              expires_at: expiresAt,
              preferred_start: preferredStart ?? null,
              preferred_end: preferredEnd ?? null,
            },
            { onConflict: 'user_id' },
          )
          .select()
          .single()

        if (upsertError || !upsertedRow) {
          setError('Failed to update availability. Please try again.')
          return
        }

        const availabilityId: string = upsertedRow.id

        // Replace sports: delete existing rows then insert the new selection
        await supabase
          .from('availability_sports')
          .delete()
          .eq('availability_id', availabilityId)

        if (sports.length > 0) {
          const { error: sportsError } = await supabase
            .from('availability_sports')
            .insert(sports.map((sport) => ({ availability_id: availabilityId, sport })))

          if (sportsError) {
            setError('Availability saved, but failed to save sport preferences.')
            // Still refresh so the UI reflects the saved availability
          }
        }

        await fetchAvailability()
      } finally {
        setLoading(false)
      }
    },
    [userId, fetchAvailability],
  )

  /**
   * Declare the user as unavailable.
   * Sets is_available=false; does not delete the record so the expiry
   * timestamp is preserved for audit purposes. (Requirement 6.2)
   */
  const declareUnavailable = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('availability')
        .update({ is_available: false })
        .eq('user_id', userId)

      if (updateError) {
        setError('Failed to update availability. Please try again.')
        return
      }

      await fetchAvailability()
    } finally {
      setLoading(false)
    }
  }, [userId, fetchAvailability])

  return {
    availability,
    loading,
    error,
    declareAvailable,
    declareUnavailable,
    refresh: fetchAvailability,
  }
}
