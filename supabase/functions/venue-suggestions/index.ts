// Feature: show-up-2-move
// Edge Function: venue-suggestions
//
// Responsibilities (Task 17):
//   - Accept POST requests with sport, participant count, and location
//   - Call AI microservice POST /venue-recommendations
//   - Return up to 5 venue options with name, estimated price, and distance
//   - Return empty list on AI failure (graceful degradation)
//
// Requirements: 11.1, 11.2

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Timeout in milliseconds for AI microservice calls (Requirement 14.2). */
const AI_TIMEOUT_MS = 3000

interface VenueRequest {
  sport: string
  participant_count: number
  location: {
    lat: number
    lng: number
  }
}

interface VenueOption {
  name: string
  price_est: number | null
  distance_km: number
}

interface VenueResponse {
  venues: VenueOption[]
  error?: string
}

/**
 * Call the AI microservice to get venue recommendations.
 *
 * @param aiBaseUrl - Base URL of the AI microservice (e.g. "http://ai:8000")
 * @param request - Venue request with sport, participant count, and location
 * @returns Array of up to 5 venue options, or empty array on failure
 */
async function getVenueRecommendations(
  aiBaseUrl: string,
  request: VenueRequest,
): Promise<VenueOption[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const res = await fetch(`${aiBaseUrl}/venue-recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sport: request.sport,
        participant_count: request.participant_count,
        location: request.location,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(
        `[venue-suggestions] AI service returned non-200: ${res.status}. ` +
        'Returning empty venue list (graceful degradation).',
      )
      return []
    }

    const json = await res.json()
    const venues = Array.isArray(json?.venues) ? json.venues : []

    // Limit to 5 venues (Requirement 11.1)
    return venues.slice(0, 5).map((v: any) => ({
      name: v.name ?? 'Unknown venue',
      price_est: typeof v.price_est === 'number' ? v.price_est : null,
      distance_km: typeof v.distance_km === 'number' ? v.distance_km : 0,
    }))
  } catch (error) {
    clearTimeout(timeoutId)
    console.warn(
      `[venue-suggestions] AI service call failed: ${error instanceof Error ? error.message : 'unknown error'}. ` +
      'Returning empty venue list (graceful degradation).',
    )
    return []
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify authentication
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Create Supabase client with user's JWT to verify authentication
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  })

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Parse request body
  let body: VenueRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate required fields
  if (!body.sport || typeof body.participant_count !== 'number' || !body.location) {
    return new Response(
      JSON.stringify({
        error: 'Missing required fields: sport, participant_count, location',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (
    typeof body.location.lat !== 'number' ||
    typeof body.location.lng !== 'number'
  ) {
    return new Response(
      JSON.stringify({ error: 'Invalid location: lat and lng must be numbers' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Get AI base URL from environment
  const aiBaseUrl = Deno.env.get('AI_BASE_URL')

  if (!aiBaseUrl) {
    // AI service not configured — return empty list (Requirement 11.2)
    console.warn('[venue-suggestions] AI_BASE_URL not set. Returning empty venue list.')
    const response: VenueResponse = {
      venues: [],
      error: 'AI suggestions are temporarily unavailable',
    }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Call AI service
  const venues = await getVenueRecommendations(aiBaseUrl, body)

  const response: VenueResponse = {
    venues,
    ...(venues.length === 0 && { error: 'AI suggestions are temporarily unavailable' }),
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
