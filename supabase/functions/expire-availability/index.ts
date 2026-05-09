// Feature: show-up-2-move
// Edge Function: expire-availability
//
// Triggered by pg_cron every 1 minute.
// Responsibilities for task 7:
//   - Query availability records where expires_at <= NOW() and is_available = true
//   - Set is_available = false for expired records
//   - Delete corresponding rows from matching_queue
//   - Insert a notification for each affected user: "Your availability has expired"
//
// Requirements: 6.4, 16.5

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  // Step 1: Query expired availability records
  // (Requirement 6.4, 16.5)
  // -------------------------------------------------------------------------
  const now = new Date().toISOString()

  const { data: expiredRecords, error: queryError } = await supabase
    .from('availability')
    .select('id, user_id')
    .eq('is_available', true)
    .lte('expires_at', now)

  if (queryError) {
    console.error('[expire-availability] Failed to query expired records:', queryError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to query expired records', details: queryError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!expiredRecords || expiredRecords.length === 0) {
    // No expired records found — nothing to do
    return new Response(
      JSON.stringify({ message: 'No expired availability records found', expiredCount: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const expiredUserIds = expiredRecords.map((record) => record.user_id)
  const expiredCount = expiredRecords.length

  console.log(`[expire-availability] Found ${expiredCount} expired availability record(s)`)

  // -------------------------------------------------------------------------
  // Step 2: Set is_available = false for expired records
  // (Requirement 6.4)
  // -------------------------------------------------------------------------
  const { error: updateError } = await supabase
    .from('availability')
    .update({ is_available: false })
    .eq('is_available', true)
    .lte('expires_at', now)

  if (updateError) {
    console.error('[expire-availability] Failed to update expired records:', updateError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to update expired records', details: updateError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log(`[expire-availability] Updated ${expiredCount} availability record(s) to is_available=false`)

  // -------------------------------------------------------------------------
  // Step 3: Delete corresponding rows from matching_queue
  // (Requirement 16.5)
  // -------------------------------------------------------------------------
  const { error: deleteError } = await supabase
    .from('matching_queue')
    .delete()
    .in('user_id', expiredUserIds)

  if (deleteError) {
    console.error('[expire-availability] Failed to delete from matching_queue:', deleteError.message)
    // Continue — the availability has been marked as expired; queue cleanup can be retried
  } else {
    console.log(`[expire-availability] Deleted matching_queue entries for ${expiredCount} user(s)`)
  }

  // -------------------------------------------------------------------------
  // Step 4: Insert notifications for affected users
  // (Requirement 16.5)
  // -------------------------------------------------------------------------
  const notifications = expiredUserIds.map((userId) => ({
    user_id: userId,
    type: 'availability_expired',
    title: 'Your availability has expired',
    body: 'Your availability window has ended. Tap "ShowUpToday?" to declare availability again.',
    data: {},
  }))

  const { error: notifError } = await supabase
    .from('notifications')
    .insert(notifications)

  if (notifError) {
    console.error('[expire-availability] Failed to insert notifications:', notifError.message)
    // Continue — the core expiry logic has succeeded; notifications can be retried
  } else {
    console.log(`[expire-availability] Inserted ${expiredCount} expiry notification(s)`)
  }

  // -------------------------------------------------------------------------
  // Step 5: Return summary
  // -------------------------------------------------------------------------
  return new Response(
    JSON.stringify({
      message: 'Availability expiry completed successfully',
      expiredCount,
      expiredUserIds,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
