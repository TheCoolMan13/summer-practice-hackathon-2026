// Feature: show-up-2-move
// Edge Function: ai-proxy
//
// Responsibilities (Task 17):
//   - Proxy AI requests with 3-second timeout
//   - Return degraded response on failure: { sports: [], error: "service unavailable" }
//   - Implement AI health check: mark AI unavailable when /health returns non-200 or times out
//   - Auto-resume on recovery
//
// Requirements: 14.1, 14.2, 14.4

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Timeout in milliseconds for AI microservice calls (Requirement 14.2). */
const AI_TIMEOUT_MS = 3000

/** Health check cache duration in milliseconds (2 seconds). */
const HEALTH_CHECK_CACHE_MS = 2000

/** In-memory health status cache. */
let aiHealthStatus: {
  isAvailable: boolean
  lastChecked: number
} = {
  isAvailable: true,
  lastChecked: 0,
}

interface ProxyRequest {
  endpoint: string // e.g., "/extract-interests", "/profile-compatibility", "/venue-recommendations"
  method?: string // defaults to POST
  body?: any
}

interface DegradedResponse {
  sports?: never[]
  error: string
}

/**
 * Check AI service health by calling GET /health.
 *
 * @param aiBaseUrl - Base URL of the AI microservice
 * @returns true if AI is healthy (200 response within timeout), false otherwise
 */
async function checkAIHealth(aiBaseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const res = await fetch(`${aiBaseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      console.log('[ai-proxy] AI service health check passed.')
      return true
    } else {
      console.warn(`[ai-proxy] AI service health check failed: ${res.status}`)
      return false
    }
  } catch (error) {
    clearTimeout(timeoutId)
    console.warn(
      `[ai-proxy] AI service health check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
    return false
  }
}

/**
 * Get cached AI health status or perform a fresh health check if cache is stale.
 *
 * @param aiBaseUrl - Base URL of the AI microservice
 * @returns true if AI is available, false otherwise
 */
async function getAIHealthStatus(aiBaseUrl: string): Promise<boolean> {
  const now = Date.now()

  // Return cached status if fresh
  if (now - aiHealthStatus.lastChecked < HEALTH_CHECK_CACHE_MS) {
    return aiHealthStatus.isAvailable
  }

  // Perform fresh health check
  const isAvailable = await checkAIHealth(aiBaseUrl)
  aiHealthStatus = {
    isAvailable,
    lastChecked: now,
  }

  return isAvailable
}

/**
 * Proxy a request to the AI microservice with timeout and error handling.
 *
 * @param aiBaseUrl - Base URL of the AI microservice
 * @param request - Proxy request with endpoint, method, and body
 * @returns Response from AI service or degraded response on failure
 */
async function proxyAIRequest(
  aiBaseUrl: string,
  request: ProxyRequest,
): Promise<{ success: boolean; data: any }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  const method = request.method ?? 'POST'
  const url = `${aiBaseUrl}${request.endpoint}`

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(
        `[ai-proxy] AI service returned non-200: ${res.status} for ${request.endpoint}. ` +
        'Returning degraded response.',
      )
      return { success: false, data: null }
    }

    const json = await res.json()
    return { success: true, data: json }
  } catch (error) {
    clearTimeout(timeoutId)
    console.warn(
      `[ai-proxy] AI service call failed for ${request.endpoint}: ${error instanceof Error ? error.message : 'unknown error'}. ` +
      'Returning degraded response.',
    )
    return { success: false, data: null }
  }
}

/**
 * Generate a degraded response based on the endpoint.
 *
 * @param endpoint - The AI endpoint that failed
 * @returns Degraded response appropriate for the endpoint
 */
function getDegradedResponse(endpoint: string): any {
  // Default degraded response for /extract-interests
  if (endpoint.includes('extract-interests')) {
    return {
      sports: [],
      error: 'service unavailable',
    }
  }

  // Degraded response for /profile-compatibility
  if (endpoint.includes('profile-compatibility')) {
    return {
      score: 0.5, // neutral compatibility score
      error: 'service unavailable',
    }
  }

  // Degraded response for /venue-recommendations
  if (endpoint.includes('venue-recommendations')) {
    return {
      venues: [],
      error: 'service unavailable',
    }
  }

  // Generic degraded response
  return {
    error: 'service unavailable',
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
  let body: ProxyRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate required fields
  if (!body.endpoint) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: endpoint' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Get AI base URL from environment
  const aiBaseUrl = Deno.env.get('AI_BASE_URL')

  if (!aiBaseUrl) {
    // AI service not configured — return degraded response (Requirement 14.3)
    console.warn('[ai-proxy] AI_BASE_URL not set. Returning degraded response.')
    const degradedResponse = getDegradedResponse(body.endpoint)
    return new Response(JSON.stringify(degradedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Check AI health status (Requirement 14.1, 14.4)
  const isHealthy = await getAIHealthStatus(aiBaseUrl)

  if (!isHealthy) {
    // AI service is unhealthy — return degraded response (Requirement 14.2)
    console.warn('[ai-proxy] AI service is unhealthy. Returning degraded response.')
    const degradedResponse = getDegradedResponse(body.endpoint)
    return new Response(JSON.stringify(degradedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Proxy the request to the AI service
  const { success, data } = await proxyAIRequest(aiBaseUrl, body)

  if (!success) {
    // AI request failed — return degraded response
    const degradedResponse = getDegradedResponse(body.endpoint)
    return new Response(JSON.stringify(degradedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Success — return AI response
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
