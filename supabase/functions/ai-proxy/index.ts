// Feature: show-up-2-move
// Edge Function: ai-proxy
//
// Two modes of operation, picked by the request payload:
//
//  (a) Built-in actions.  Example: `{ action: "extract-interests", bio: "..." }`.
//      The function runs an LLM (OpenAI) when `OPENAI_API_KEY` is set, and
//      falls back to a deterministic keyword matcher when it isn't. This
//      is what the web app uses to auto-generate sports from a user bio.
//
//  (b) Legacy proxy mode. Example: `{ endpoint: "/health", method: "GET" }`.
//      The function forwards the request to the AI microservice at
//      `AI_BASE_URL`. This keeps existing consumers (aiHealth.ts,
//      match-users, reengage-users, venue-suggestions) working unchanged.
//
// In both modes, every failure collapses to a stable degraded payload so
// core flows never block on AI. Requirements: 4.1, 4.2, 14.1, 14.2, 14.4.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ──────────────────────────────────────────────────────────────────

const AI_TIMEOUT_MS = 3000
const OPENAI_MODEL = 'gpt-4o-mini'

// Canonical sports the rest of the app understands. The LLM is constrained
// to return values from this list; the keyword fallback matches them too.
const KNOWN_SPORTS = [
  'football', 'basketball', 'tennis', 'volleyball',
] as const
type KnownSport = (typeof KNOWN_SPORTS)[number]

// ── Legacy health cache ─────────────────────────────────────────────────────

let aiHealthStatus: { isAvailable: boolean; lastChecked: number } = {
  isAvailable: true,
  lastChecked: 0,
}
const HEALTH_CHECK_CACHE_MS = 2000

// ── Shared helpers ──────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// ── Built-in action: extract-interests ─────────────────────────────────────

interface ExtractInterestsPayload {
  action: 'extract-interests'
  bio?: string
}

interface ExtractInterestsResponse {
  sports: string[]
  source?: 'llm' | 'keyword' | 'empty'
  error?: string
}

/**
 * Keyword-based sport extractor. Used as a deterministic fallback when the
 * LLM is unavailable or unconfigured. Matches sport names and common
 * phrasings ("play basketball", "footballer", "on the tennis court", etc.).
 */
function extractSportsByKeyword(bio: string): KnownSport[] {
  const text = bio.toLowerCase()
  const hits = new Set<KnownSport>()

  // Direct mentions.
  if (/\bfootball(ers?)?\b|\bsoccer\b/.test(text)) hits.add('football')
  if (/\bbasketball(ers?)?\b|\bhoops?\b/.test(text)) hits.add('basketball')
  if (/\btennis\b/.test(text)) hits.add('tennis')
  if (/\bvolleyball\b|\bbeach\s*volley\b/.test(text)) hits.add('volleyball')

  return Array.from(hits)
}

/**
 * Call OpenAI's chat completions API and ask for a JSON array of sports
 * drawn strictly from KNOWN_SPORTS. Returns an empty array on any error
 * (network, non-200, non-JSON, unknown sport, abort).
 */
async function extractSportsWithLLM(bio: string, apiKey: string): Promise<KnownSport[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  const allowed = KNOWN_SPORTS.join(', ')
  const systemPrompt = [
    'You extract sports a person plays from a short bio.',
    `Return only sports from this closed list: ${allowed}.`,
    'Respond with a JSON object: {"sports": ["football", "tennis"]}.',
    'If none are clearly implied, return {"sports": []}. Do not invent sports.',
  ].join(' ')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: bio },
        ],
      }),
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(`[ai-proxy] OpenAI non-200: ${res.status}`)
      return []
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) return []

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return []
    }

    const raw = (parsed as { sports?: unknown })?.sports
    if (!Array.isArray(raw)) return []

    const allowedSet = new Set<string>(KNOWN_SPORTS)
    const result: KnownSport[] = []
    for (const item of raw) {
      if (typeof item !== 'string') continue
      const s = item.toLowerCase().trim()
      if (allowedSet.has(s) && !result.includes(s as KnownSport)) {
        result.push(s as KnownSport)
      }
    }
    return result
  } catch (err) {
    clearTimeout(timeoutId)
    console.warn(`[ai-proxy] OpenAI call failed: ${err instanceof Error ? err.message : 'unknown'}`)
    return []
  }
}

async function handleExtractInterests(
  payload: ExtractInterestsPayload,
): Promise<ExtractInterestsResponse> {
  const bio = (payload.bio ?? '').trim()
  if (!bio) {
    return { sports: [], source: 'empty' }
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')

  // Prefer the LLM when configured.
  if (openaiKey) {
    const sports = await extractSportsWithLLM(bio, openaiKey)
    if (sports.length > 0) {
      return { sports, source: 'llm' }
    }
    // LLM returned nothing useful — try the deterministic fallback so the
    // user still gets something when the bio is unambiguous ("I love tennis").
    const fallback = extractSportsByKeyword(bio)
    return fallback.length > 0
      ? { sports: fallback, source: 'keyword' }
      : { sports: [], source: 'llm' }
  }

  // No LLM configured — fall back to keyword matching.
  const sports = extractSportsByKeyword(bio)
  return { sports, source: sports.length > 0 ? 'keyword' : 'empty' }
}

// ── Legacy proxy mode ───────────────────────────────────────────────────────

interface LegacyProxyRequest {
  endpoint: string
  method?: string
  body?: unknown
}

async function checkAIHealth(aiBaseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const res = await fetch(`${aiBaseUrl}/health`, { method: 'GET', signal: controller.signal })
    clearTimeout(timeoutId)
    return res.ok
  } catch {
    clearTimeout(timeoutId)
    return false
  }
}

async function getAIHealthStatus(aiBaseUrl: string): Promise<boolean> {
  const now = Date.now()
  if (now - aiHealthStatus.lastChecked < HEALTH_CHECK_CACHE_MS) {
    return aiHealthStatus.isAvailable
  }
  const isAvailable = await checkAIHealth(aiBaseUrl)
  aiHealthStatus = { isAvailable, lastChecked: now }
  return isAvailable
}

async function proxyAIRequest(
  aiBaseUrl: string,
  request: LegacyProxyRequest,
): Promise<{ success: boolean; data: unknown }> {
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
      console.warn(`[ai-proxy] Non-200 ${res.status} for ${request.endpoint}`)
      return { success: false, data: null }
    }
    return { success: true, data: await res.json() }
  } catch (err) {
    clearTimeout(timeoutId)
    console.warn(
      `[ai-proxy] Proxy call failed for ${request.endpoint}: ${err instanceof Error ? err.message : 'unknown'}`,
    )
    return { success: false, data: null }
  }
}

function getDegradedResponse(endpoint: string): unknown {
  if (endpoint.includes('extract-interests')) {
    return { sports: [], error: 'service unavailable' }
  }
  if (endpoint.includes('profile-compatibility')) {
    return { score: 0.5, error: 'service unavailable' }
  }
  if (endpoint.includes('venue-recommendations')) {
    return { venues: [], error: 'service unavailable' }
  }
  return { error: 'service unavailable' }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight — browsers send OPTIONS before the real POST.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, { error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const payload = body as Partial<ExtractInterestsPayload & LegacyProxyRequest>

  // (a) Built-in actions — executed here, not proxied.
  if (payload.action === 'extract-interests') {
    try {
      const response = await handleExtractInterests(payload as ExtractInterestsPayload)
      return jsonResponse(200, response)
    } catch (err) {
      console.warn(`[ai-proxy] extract-interests failed: ${err instanceof Error ? err.message : 'unknown'}`)
      // Degraded — never fail the user's save flow because of AI.
      return jsonResponse(200, { sports: [], error: 'service unavailable' })
    }
  }

  // (b) Legacy proxy mode.
  if (!payload.endpoint) {
    return jsonResponse(400, {
      error: 'Missing required field: provide either `action` or `endpoint`',
    })
  }

  const aiBaseUrl = Deno.env.get('AI_BASE_URL')
  if (!aiBaseUrl) {
    return jsonResponse(200, getDegradedResponse(payload.endpoint))
  }

  const healthy = await getAIHealthStatus(aiBaseUrl)
  if (!healthy) {
    return jsonResponse(200, getDegradedResponse(payload.endpoint))
  }

  const { success, data } = await proxyAIRequest(aiBaseUrl, payload as LegacyProxyRequest)
  if (!success) {
    return jsonResponse(200, getDegradedResponse(payload.endpoint))
  }
  return jsonResponse(200, data)
})
