// Feature: show-up-2-move
// Edge Function: reengage-users
//
// Triggered by pg_cron daily to identify inactive users and send personalized
// re-engagement reminders.
//
// Responsibilities (Task 21.1):
//   - Query users with no availability record in the last 5 days
//   - Check last re-engagement notification timestamp; skip if sent within 48 hours
//   - Call AI POST /generate-message with user sport preferences and activity history
//   - Fall back to generic message on AI failure
//   - INSERT notification; record timestamp to enforce 48-hour rate limit
//   - Register pg_cron schedule: daily
//
// Requirements: 15.1, 15.2, 15.3, 15.4

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Timeout in milliseconds for AI microservice calls. */
const AI_TIMEOUT_MS = 3000

/** Inactivity threshold in days (Requirement 15.1). */
const INACTIVITY_THRESHOLD_DAYS = 5

/** Rate limit window in hours (Requirement 15.4). */
const RATE_LIMIT_HOURS = 48

/** Generic fallback message when AI is unavailable (Requirement 15.3). */
const GENERIC_MESSAGE = "It's been a while — ready to ShowUp2Move today?"

/**
 * Call AI service to generate a personalized re-engagement message.
 *
 * @param aiBaseUrl - Base URL of the AI microservice
 * @param userId - User ID for context
 * @param sports - Array of user's preferred sports
 * @param lastActivityDate - Date of user's last activity (ISO string)
 * @returns Personalized message or null on failure
 */
async function generatePersonalizedMessage(
  aiBaseUrl: string,
  userId: string,
  sports: string[],
  lastActivityDate: string | null,
): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const res = await fetch(`${aiBaseUrl}/generate-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        sports,
        last_activity_date: lastActivityDate,
        message_type: 're-engagement',
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(
        `[reengage-users] AI service returned non-200: ${res.status}. ` +
        'Falling back to generic message.',
      )
      return null
    }

    const json = await res.json()
    const message = typeof json?.message === 'string' ? json.message : null

    if (!message) {
      console.warn('[reengage-users] AI response missing message field. Falling back to generic.')
      return null
    }

    return message
  } catch (error) {
    clearTimeout(timeoutId)
    console.warn(
      `[reengage-users] AI service call failed: ${error instanceof Error ? error.message : 'unknown error'}. ` +
      'Falling back to generic message.',
    )
    return null
  }
}

/**
 * Query inactive users who haven't declared availability in the last N days
 * and haven't received a re-engagement notification within the rate limit window.
 *
 * @param supabase - Supabase client with service role key
 * @param inactivityThresholdDays - Number of days of inactivity to trigger re-engagement
 * @param rateLimitHours - Minimum hours between re-engagement notifications
 * @returns Array of inactive users with their sport preferences
 */
async function getInactiveUsers(
  supabase: any,
  inactivityThresholdDays: number,
  rateLimitHours: number,
) {
  const inactivityCutoff = new Date()
  inactivityCutoff.setDate(inactivityCutoff.getDate() - inactivityThresholdDays)

  const rateLimitCutoff = new Date()
  rateLimitCutoff.setHours(rateLimitCutoff.getHours() - rateLimitHours)

  // Query users who:
  // 1. Have no availability record in the last N days OR their last availability is older than N days
  // 2. Have not received a re-engagement notification within the rate limit window
  // 3. Are not currently suppressed (7-day suppression after declaring availability - handled in task 21.2)
  
  const { data: inactiveUsers, error } = await supabase.rpc('get_inactive_users_for_reengagement', {
    inactivity_cutoff: inactivityCutoff.toISOString(),
    rate_limit_cutoff: rateLimitCutoff.toISOString(),
  })

  if (error) {
    // Fallback query if RPC doesn't exist
    console.warn('[reengage-users] RPC get_inactive_users_for_reengagement not found. Using fallback query.')
    
    // Get all users
    const { data: allUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id')

    if (usersError || !allUsers) {
      throw new Error(`Failed to query profiles: ${usersError?.message}`)
    }

    const result = []

    for (const user of allUsers) {
      // Check last availability
      const { data: lastAvailability, error: availError } = await supabase
        .from('availability')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (availError) {
        console.error(`Error checking availability for user ${user.id}:`, availError.message)
        continue
      }

      // Skip if user has recent availability
      if (lastAvailability && new Date(lastAvailability.created_at) > inactivityCutoff) {
        continue
      }

      // Check last re-engagement notification
      const { data: lastNotification, error: notifError } = await supabase
        .from('notifications')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('type', 're_engagement')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (notifError) {
        console.error(`Error checking notifications for user ${user.id}:`, notifError.message)
        continue
      }

      // Skip if user received a re-engagement notification within rate limit window
      if (lastNotification && new Date(lastNotification.created_at) > rateLimitCutoff) {
        continue
      }

      // Get user's sports
      const { data: userSports, error: sportsError } = await supabase
        .from('user_sports')
        .select('sport')
        .eq('user_id', user.id)

      if (sportsError) {
        console.error(`Error fetching sports for user ${user.id}:`, sportsError.message)
        continue
      }

      result.push({
        user_id: user.id,
        sports: (userSports || []).map((s: any) => s.sport),
        last_activity_date: lastAvailability?.created_at || null,
      })
    }

    return result
  }

  return inactiveUsers || []
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
  // Step 1: Query inactive users
  // (Requirements 15.1, 15.4)
  // -------------------------------------------------------------------------
  let inactiveUsers: Array<{
    user_id: string
    sports: string[]
    last_activity_date: string | null
  }>

  try {
    inactiveUsers = await getInactiveUsers(
      supabase,
      INACTIVITY_THRESHOLD_DAYS,
      RATE_LIMIT_HOURS,
    )
  } catch (error) {
    console.error('[reengage-users] Failed to query inactive users:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to query inactive users',
        details: error instanceof Error ? error.message : 'unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (inactiveUsers.length === 0) {
    console.log('[reengage-users] No inactive users found.')
    return new Response(
      JSON.stringify({ message: 'No inactive users to re-engage', count: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log(`[reengage-users] Found ${inactiveUsers.length} inactive user(s).`)

  // -------------------------------------------------------------------------
  // Step 2: Generate and send re-engagement notifications
  // (Requirements 15.2, 15.3)
  // -------------------------------------------------------------------------
  const aiBaseUrl = Deno.env.get('AI_BASE_URL')
  const notifications = []
  let aiSuccessCount = 0
  let genericFallbackCount = 0

  for (const user of inactiveUsers) {
    let message = GENERIC_MESSAGE

    // Try to generate personalized message if AI is available
    if (aiBaseUrl) {
      const personalizedMessage = await generatePersonalizedMessage(
        aiBaseUrl,
        user.user_id,
        user.sports,
        user.last_activity_date,
      )

      if (personalizedMessage) {
        message = personalizedMessage
        aiSuccessCount++
      } else {
        genericFallbackCount++
      }
    } else {
      genericFallbackCount++
    }

    notifications.push({
      user_id: user.user_id,
      type: 're_engagement',
      title: 'Come back and play! 🏃',
      body: message,
      data: {
        sports: user.sports,
        last_activity_date: user.last_activity_date,
      },
    })
  }

  // Insert all notifications in a single batch
  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notifications)

  if (insertError) {
    console.error('[reengage-users] Failed to insert notifications:', insertError.message)
    return new Response(
      JSON.stringify({
        error: 'Failed to insert notifications',
        details: insertError.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log(
    `[reengage-users] Successfully sent ${notifications.length} re-engagement notification(s). ` +
    `AI-generated: ${aiSuccessCount}, Generic fallback: ${genericFallbackCount}.`,
  )

  // -------------------------------------------------------------------------
  // Step 3: Return summary
  // -------------------------------------------------------------------------
  return new Response(
    JSON.stringify({
      message: 'Re-engagement notifications sent successfully',
      count: notifications.length,
      ai_generated: aiSuccessCount,
      generic_fallback: genericFallbackCount,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
