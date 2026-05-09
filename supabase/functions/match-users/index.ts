// Feature: show-up-2-move
// Edge Function: match-users
//
// Triggered by pg_cron every 5 minutes (or via HTTP POST for manual runs).
// Responsibilities for task 8.1:
//   - Query active available users grouped by sport
//   - Apply 10 km proximity clustering (Haversine distance)
//   - Apply skill-level compatibility filter (within one tier)
//   - Form groups satisfying SPORT_SIZES[sport].min ≤ size ≤ SPORT_SIZES[sport].max
//   - Queue users that cannot form a complete group + send "Matching in progress" notification
//   - Return formed groups for downstream tasks (8.3 group creation)
//
// Task 8.2 additions:
//   - Optionally call AI microservice POST /profile-compatibility for candidate pairs
//   - Use compatibility scores as a secondary ranking signal before forming groups
//   - Gracefully degrade when AI is unavailable (Requirements 7.5, 14.3)
//
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 14.3

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Candidate, FormedGroup, MatchResult, SportSize } from './types.ts'
import { selectCaptain } from './captainSelector.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPORT_SIZES: Record<string, SportSize> = {
  football:   { min: 10, max: 14 },
  basketball: { min: 6,  max: 10 },
  tennis:     { min: 2,  max: 4  },
  volleyball: { min: 8,  max: 12 },
}

const SKILL_TIERS: Record<string, number> = {
  beginner:     0,
  intermediate: 1,
  advanced:     2,
}

/** Maximum proximity radius in kilometres (Requirement 7.3). */
const PROXIMITY_RADIUS_KM = 10

// ---------------------------------------------------------------------------
// Haversine distance (km) between two lat/lng points
// Used instead of PostGIS ST_DWithin because Edge Functions run in Deno and
// cannot issue raw SQL with PostGIS functions through the JS client.
// ---------------------------------------------------------------------------
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ---------------------------------------------------------------------------
// Skill compatibility check (Requirement 7.4)
// Two users are compatible when their skill tiers differ by at most 1.
// Users with no skill data (null) are treated as compatible with everyone.
// ---------------------------------------------------------------------------
function skillsCompatible(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true
  const tierA = SKILL_TIERS[a] ?? -1
  const tierB = SKILL_TIERS[b] ?? -1
  if (tierA === -1 || tierB === -1) return true
  return Math.abs(tierA - tierB) <= 1
}

// ---------------------------------------------------------------------------
// Proximity check (Requirement 7.3)
// Returns true when both users have location data and are within the radius,
// OR when either user has no location data (location is optional per Req 13.3).
// ---------------------------------------------------------------------------
function withinProximity(a: Candidate, b: Candidate): boolean {
  if (
    a.location_lat === null || a.location_lng === null ||
    b.location_lat === null || b.location_lng === null
  ) {
    return true // no location data → do not exclude (Requirement 13.3)
  }
  return haversineKm(
    a.location_lat, a.location_lng,
    b.location_lat, b.location_lng,
  ) <= PROXIMITY_RADIUS_KM
}

// ---------------------------------------------------------------------------
// AI compatibility scoring (Requirements 7.5, 14.3)
//
// Calls POST {AI_BASE_URL}/profile-compatibility for each pair of candidates.
// Returns a Map of "userId1:userId2" → score (0.0–1.0).
// On any error (timeout, non-200, network failure) returns an empty Map so
// that the matching engine can proceed without AI scores (graceful degradation).
// ---------------------------------------------------------------------------

/** Timeout in milliseconds for AI microservice calls (Requirement 14.3). */
const AI_TIMEOUT_MS = 3000

/**
 * Fetch pairwise compatibility scores from the AI microservice.
 *
 * @param candidates - The candidate pool for a single sport.
 * @param aiBaseUrl  - Base URL of the AI microservice (e.g. "http://ai:8000").
 * @returns A Map keyed by "userId1:userId2" with scores in [0, 1].
 *          Returns an empty Map on any failure so callers can degrade gracefully.
 */
export async function getCompatibilityScores(
  candidates: Candidate[],
  aiBaseUrl: string,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>()

  if (candidates.length < 2) {
    return scores // nothing to score
  }

  // Build all unique pairs (i < j to avoid duplicates)
  const pairs: [string, string][] = []
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      pairs.push([candidates[i].user_id, candidates[j].user_id])
    }
  }

  // Call the AI endpoint for each pair with a shared AbortController timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    await Promise.all(
      pairs.map(async ([id1, id2]) => {
        try {
          const res = await fetch(`${aiBaseUrl}/profile-compatibility`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_ids: [id1, id2] }),
            signal: controller.signal,
          })

          if (!res.ok) {
            // Non-2xx response — skip this pair, do not throw
            return
          }

          const json = await res.json()
          const score = typeof json?.score === 'number' ? json.score : null
          if (score !== null) {
            scores.set(`${id1}:${id2}`, score)
          }
        } catch {
          // Individual pair failure — skip silently; other pairs may still succeed
        }
      }),
    )
  } catch {
    // Outer catch for unexpected errors — return whatever scores we have so far
  } finally {
    clearTimeout(timeoutId)
  }

  return scores
}

/**
 * Re-rank candidates by their average pairwise compatibility score.
 *
 * Candidates with higher average compatibility with the rest of the group
 * are placed first so that `formGroups` seeds clusters from the most
 * compatible users.  Falls back to the original order when the scores map
 * is empty (AI unavailable).
 *
 * @param candidates - Candidates for a single sport.
 * @param scores     - Map returned by `getCompatibilityScores`.
 * @returns A new array sorted by descending average compatibility score.
 */
export function rankCandidatesByCompatibility(
  candidates: Candidate[],
  scores: Map<string, number>,
): Candidate[] {
  if (scores.size === 0) {
    // No scores available — preserve original order (graceful degradation)
    return [...candidates]
  }

  // Compute average compatibility score for each candidate
  const avgScore = (candidate: Candidate): number => {
    const others = candidates.filter((c) => c.user_id !== candidate.user_id)
    if (others.length === 0) return 0

    let total = 0
    let count = 0
    for (const other of others) {
      const key1 = `${candidate.user_id}:${other.user_id}`
      const key2 = `${other.user_id}:${candidate.user_id}`
      const score = scores.get(key1) ?? scores.get(key2)
      if (score !== undefined) {
        total += score
        count++
      }
    }

    return count > 0 ? total / count : 0
  }

  return [...candidates].sort((a, b) => avgScore(b) - avgScore(a))
}

// ---------------------------------------------------------------------------
// Greedy proximity + skill clustering
//
// Algorithm:
//   1. Pick the first unassigned candidate as a "seed".
//   2. Collect all unassigned candidates that are within PROXIMITY_RADIUS_KM
//      of the seed AND have a compatible skill level with the seed.
//   3. From that cluster, greedily fill a group up to max_size.
//   4. If the cluster has ≥ min_size members, form a group and remove them
//      from the pool.  Otherwise, leave them in the pool for queuing.
//   5. Repeat until no unassigned candidates remain.
//
// This is a single-pass greedy approach.  It is intentionally simple and
// deterministic so that it can be unit-tested without a database.
// ---------------------------------------------------------------------------
export function formGroups(candidates: Candidate[], sport: string): {
  groups: FormedGroup[]
  unmatched: Candidate[]
} {
  const sizes = SPORT_SIZES[sport]
  if (!sizes) {
    // Unknown sport — queue everyone
    return { groups: [], unmatched: candidates }
  }

  const pool = [...candidates]
  const groups: FormedGroup[] = []
  const unmatched: Candidate[] = []

  while (pool.length > 0) {
    const seed = pool.shift()! // take first candidate as seed

    // Collect candidates compatible with the seed (proximity + skill)
    const compatible: Candidate[] = [seed]
    const remaining: Candidate[] = []

    for (const c of pool) {
      if (withinProximity(seed, c) && skillsCompatible(seed.skill_level, c.skill_level)) {
        compatible.push(c)
      } else {
        remaining.push(c)
      }
    }

    if (compatible.length >= sizes.min) {
      // Form one group (up to max_size) from the compatible cluster
      const groupMembers = compatible.slice(0, sizes.max)
      groups.push({ sport, members: groupMembers.map((c) => c.user_id) })

      // Leftover compatible candidates that didn't fit go back to the pool
      const leftover = compatible.slice(sizes.max)
      pool.splice(0, pool.length, ...leftover, ...remaining)
    } else {
      // Not enough compatible candidates — mark seed as unmatched and continue
      unmatched.push(seed)
      pool.splice(0, pool.length, ...remaining)
    }
  }

  return { groups, unmatched }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // Only allow POST (pg_cron sends POST; manual triggers also use POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Use the service role key so the function can bypass RLS
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // -------------------------------------------------------------------------
  // Step 1: Query active available users with their sports and location
  // (Requirement 7.1, 7.3, 7.4)
  // -------------------------------------------------------------------------
  const { data: rows, error: queryError } = await supabase.rpc('get_available_candidates')

  // Fallback: if the RPC doesn't exist yet, use a raw query via PostgREST views.
  // The RPC is preferred because it can use PostGIS ST_DWithin server-side.
  // For now we fetch all active candidates and apply proximity in JS (Haversine).
  let candidates: Candidate[]

  if (queryError || !rows) {
    // Fallback query using PostgREST joins
    const { data: fallbackRows, error: fallbackError } = await supabase
      .from('availability')
      .select(`
        user_id,
        profiles!inner ( location_lat, location_lng ),
        availability_sports!inner ( sport ),
        user_sports ( skill_level )
      `)
      .eq('is_available', true)
      .gt('expires_at', new Date().toISOString())

    if (fallbackError || !fallbackRows) {
      return new Response(
        JSON.stringify({ error: 'Failed to query candidates', details: fallbackError?.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Flatten the nested PostgREST response into Candidate[]
    candidates = []
    for (const row of fallbackRows as any[]) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
      const sports: string[] = (row.availability_sports ?? []).map((s: any) => s.sport)
      const userSports: any[] = row.user_sports ?? []

      for (const sport of sports) {
        const sportEntry = userSports.find((us: any) => us.sport === sport)
        candidates.push({
          user_id: row.user_id,
          location_lat: profile?.location_lat ?? null,
          location_lng: profile?.location_lng ?? null,
          sport,
          skill_level: sportEntry?.skill_level ?? null,
        })
      }
    }
  } else {
    candidates = rows as Candidate[]
  }

  // -------------------------------------------------------------------------
  // Step 2: Group candidates by sport
  // -------------------------------------------------------------------------
  const bySport: Record<string, Candidate[]> = {}
  for (const c of candidates) {
    if (!bySport[c.sport]) bySport[c.sport] = []
    bySport[c.sport].push(c)
  }

  // -------------------------------------------------------------------------
  // Step 2.5: Optionally re-rank candidates using AI compatibility scores
  // (Requirements 7.5, 14.3)
  //
  // If AI_BASE_URL is set, call the AI microservice for pairwise compatibility
  // scores and re-rank each sport's candidate list so that higher-compatibility
  // users are grouped together.  If AI is unavailable (empty scores map or env
  // var not set), log a warning and proceed with the original order.
  // -------------------------------------------------------------------------
  const aiBaseUrl = Deno.env.get('AI_BASE_URL')

  for (const sport of Object.keys(bySport)) {
    if (aiBaseUrl) {
      const scores = await getCompatibilityScores(bySport[sport], aiBaseUrl)
      if (scores.size === 0) {
        console.warn(
          `[match-users] AI compatibility scores unavailable for sport "${sport}". ` +
          'Proceeding without AI ranking (graceful degradation).',
        )
      }
      bySport[sport] = rankCandidatesByCompatibility(bySport[sport], scores)
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: For each sport, apply proximity + skill clustering and form groups
  // -------------------------------------------------------------------------
  const allFormedGroups: FormedGroup[] = []
  const allUnmatched: { user_id: string; sport: string }[] = []

  for (const [sport, sportCandidates] of Object.entries(bySport)) {
    const { groups, unmatched } = formGroups(sportCandidates, sport)
    allFormedGroups.push(...groups)
    allUnmatched.push(...unmatched.map((c) => ({ user_id: c.user_id, sport: c.sport })))
  }

  // -------------------------------------------------------------------------
  // Step 4: Queue unmatched users and send "Matching in progress" notifications
  // (Requirements 7.6, 7.7)
  // -------------------------------------------------------------------------
  if (allUnmatched.length > 0) {
    // Upsert into matching_queue (UNIQUE on user_id, sport)
    const { error: queueError } = await supabase
      .from('matching_queue')
      .upsert(
        allUnmatched.map(({ user_id, sport }) => ({ user_id, sport })),
        { onConflict: 'user_id,sport' },
      )

    if (queueError) {
      console.error('Failed to upsert matching_queue:', queueError.message)
    }

    // Insert "Matching in progress" notifications for queued users
    const notifications = allUnmatched.map(({ user_id }) => ({
      user_id,
      type: 'matching_in_progress',
      title: 'Matching in progress',
      body: "We're looking for players for you. Check back soon!",
    }))

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (notifError) {
      console.error('Failed to insert matching_in_progress notifications:', notifError.message)
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Persist formed groups — INSERT groups, group_members, events,
  //         notifications, system message, and assign captain.
  //         (Requirements: 7.8, 8.1, 8.2, 8.3, 9.1, 9.3, 12.1)
  // -------------------------------------------------------------------------
  const createdGroupIds: string[] = []

  for (const formedGroup of allFormedGroups) {
    const sizes = SPORT_SIZES[formedGroup.sport] ?? { min: 2, max: formedGroup.members.length }

    // 5a. INSERT group row
    const { data: groupRow, error: groupError } = await supabase
      .from('groups')
      .insert({
        sport: formedGroup.sport,
        status: 'pending',
        min_size: sizes.min,
        max_size: sizes.max,
      })
      .select('id')
      .single()

    if (groupError || !groupRow) {
      console.error('Failed to insert group:', groupError?.message)
      continue
    }

    const groupId: string = groupRow.id
    createdGroupIds.push(groupId)

    // 5b. INSERT group_members
    const { error: membersError } = await supabase
      .from('group_members')
      .insert(formedGroup.members.map((userId) => ({ group_id: groupId, user_id: userId })))

    if (membersError) {
      console.error('Failed to insert group_members:', membersError.message)
    }

    // 5c. INSERT matched event (source='matched')
    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours from now
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .insert({
        sport: formedGroup.sport,
        title: `${formedGroup.sport.charAt(0).toUpperCase() + formedGroup.sport.slice(1)} match`,
        organizer_id: formedGroup.members[0],
        group_id: groupId,
        start_time: startTime,
        participant_limit: sizes.max,
        status: 'open',
        source: 'matched',
      })
      .select('id')
      .single()

    if (eventError) {
      console.error('Failed to insert event:', eventError.message)
    } else if (eventRow) {
      // Link event back to group
      await supabase.from('groups').update({ event_id: eventRow.id }).eq('id', groupId)
    }

    // 5d. INSERT "match_found" notifications for all members
    const matchNotifications = formedGroup.members.map((userId) => ({
      user_id: userId,
      type: 'match_found',
      title: "You've been matched! 🎉",
      body: `You've been grouped with ${formedGroup.members.length - 1} other player(s) for ${formedGroup.sport}. Check your group chat!`,
      data: { group_id: groupId },
    }))

    const { error: notifError } = await supabase.from('notifications').insert(matchNotifications)
    if (notifError) {
      console.error('Failed to insert match_found notifications:', notifError.message)
    }

    // 5e. INSERT system message "Group created"
    const { error: msgError } = await supabase.from('messages').insert({
      group_id: groupId,
      sender_id: null,
      content: `Group created for ${formedGroup.sport}. Welcome everyone! 👋`,
      type: 'system',
    })

    if (msgError) {
      console.error('Failed to insert system message:', msgError.message)
    }

    // 5f. Select and assign captain (Requirements 8.1, 8.2, 8.3)
    try {
      await selectCaptain(supabase, groupId, formedGroup.members)
    } catch (captainError) {
      console.error('Failed to assign captain for group', groupId, captainError)
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Return summary
  // -------------------------------------------------------------------------
  const result: MatchResult = {
    formedGroups: allFormedGroups,
    queuedUsers: allUnmatched,
  }

  return new Response(JSON.stringify({ ...result, createdGroupIds }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
