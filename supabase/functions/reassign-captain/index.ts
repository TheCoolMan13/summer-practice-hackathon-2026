// Feature: show-up-2-move
// Edge Function: reassign-captain
//
// Triggered by pg_cron every 15 minutes.
// Responsibilities for task 10:
//   - Query groups where status='pending' and captain has confirmed=false
//     and created_at < NOW() - interval '2 hours'
//   - Select eligible replacement (not in last 3 captain_history entries for that user)
//   - UPDATE groups.captain_id
//   - INSERT captain_history
//   - INSERT notifications for all group members
//   - INSERT system message "New captain assigned"
//
// Requirements: 8.4, 16.4

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Captain selection logic (simplified version from captainSelector.ts)
// ---------------------------------------------------------------------------

/**
 * Select a new captain from eligible group members.
 * Excludes users who appear in their last 3 captain_history entries.
 * Uses weighted random selection with reduced weight for recent captains.
 */
async function selectReplacementCaptain(
  supabase: any,
  groupId: string,
  memberIds: string[],
  currentCaptainId: string,
): Promise<string | null> {
  if (memberIds.length === 0) return null

  // Filter out the current captain (who failed to confirm)
  const eligibleMembers = memberIds.filter((id) => id !== currentCaptainId)
  if (eligibleMembers.length === 0) return null

  // Query recent captain history for eligible members
  const { data: historyRows } = await supabase
    .from('captain_history')
    .select('user_id, assigned_at')
    .in('user_id', eligibleMembers)
    .order('assigned_at', { ascending: false })

  // Count how many of the last 3 entries each user appears in
  const recentCaptainCount: Record<string, number> = {}
  for (const memberId of eligibleMembers) {
    const userHistory = (historyRows ?? [])
      .filter((row: { user_id: string }) => row.user_id === memberId)
      .slice(0, 3)
    recentCaptainCount[memberId] = userHistory.length
  }

  // Assign weights (base 3, reduce by recent captain count)
  const weights: { userId: string; weight: number }[] = eligibleMembers.map((id) => ({
    userId: id,
    weight: Math.max(0, 3 - (recentCaptainCount[id] ?? 0)),
  }))

  // If all weights are 0 (everyone was captain recently), reset to equal weights
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  const effectiveWeights = totalWeight === 0
    ? eligibleMembers.map((id) => ({ userId: id, weight: 1 }))
    : weights

  // Weighted random selection
  const totalEffectiveWeight = effectiveWeights.reduce((sum, w) => sum + w.weight, 0)
  let random = Math.random() * totalEffectiveWeight
  let selectedCaptain = effectiveWeights[0].userId

  for (const { userId, weight } of effectiveWeights) {
    random -= weight
    if (random <= 0) {
      selectedCaptain = userId
      break
    }
  }

  return selectedCaptain
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
  // Step 1: Query groups with inactive captains
  // (Requirement 8.4, 16.4)
  //
  // Find groups where:
  //   - status = 'pending'
  //   - captain has not confirmed (confirmed = false in group_members)
  //   - created_at < NOW() - interval '2 hours'
  // -------------------------------------------------------------------------
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  const { data: inactiveGroups, error: queryError } = await supabase
    .from('groups')
    .select(`
      id,
      captain_id,
      sport,
      created_at,
      group_members!inner (
        user_id,
        confirmed
      )
    `)
    .eq('status', 'pending')
    .lt('created_at', twoHoursAgo)

  if (queryError) {
    console.error('[reassign-captain] Failed to query inactive groups:', queryError.message)
    return new Response(
      JSON.stringify({ error: 'Failed to query inactive groups', details: queryError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!inactiveGroups || inactiveGroups.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No inactive captains found', reassignedCount: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Filter groups where the captain has not confirmed
  const groupsToReassign = inactiveGroups.filter((group: any) => {
    const captainMember = group.group_members.find(
      (m: any) => m.user_id === group.captain_id
    )
    return captainMember && captainMember.confirmed === false
  })

  if (groupsToReassign.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No unconfirmed captains found', reassignedCount: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log(`[reassign-captain] Found ${groupsToReassign.length} group(s) with inactive captains`)

  // -------------------------------------------------------------------------
  // Step 2: For each group, select a replacement captain and reassign
  // -------------------------------------------------------------------------
  const reassignedGroups: string[] = []

  for (const group of groupsToReassign) {
    const groupId = group.id
    const currentCaptainId = group.captain_id
    const memberIds = group.group_members.map((m: any) => m.user_id)

    console.log(`[reassign-captain] Processing group ${groupId}, current captain: ${currentCaptainId}`)

    // Select eligible replacement captain
    const newCaptainId = await selectReplacementCaptain(
      supabase,
      groupId,
      memberIds,
      currentCaptainId,
    )

    if (!newCaptainId) {
      console.warn(`[reassign-captain] No eligible replacement found for group ${groupId}`)
      continue
    }

    console.log(`[reassign-captain] Selected new captain ${newCaptainId} for group ${groupId}`)

    // Step 2a: UPDATE groups.captain_id
    const { error: updateError } = await supabase
      .from('groups')
      .update({ captain_id: newCaptainId })
      .eq('id', groupId)

    if (updateError) {
      console.error(`[reassign-captain] Failed to update captain for group ${groupId}:`, updateError.message)
      continue
    }

    // Step 2b: INSERT captain_history
    const { error: historyError } = await supabase
      .from('captain_history')
      .insert({
        user_id: newCaptainId,
        group_id: groupId,
      })

    if (historyError) {
      console.error(`[reassign-captain] Failed to insert captain_history for group ${groupId}:`, historyError.message)
    }

    // Step 2c: INSERT notifications for all group members
    const notifications = memberIds.map((userId: string) => ({
      user_id: userId,
      type: 'captain_reassigned',
      title: 'New captain assigned',
      body: userId === newCaptainId
        ? 'You are now the captain! Please confirm the event.'
        : 'A new captain has been assigned to your group.',
      data: { group_id: groupId, new_captain_id: newCaptainId },
    }))

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (notifError) {
      console.error(`[reassign-captain] Failed to insert notifications for group ${groupId}:`, notifError.message)
    }

    // Step 2d: INSERT system message "New captain assigned"
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        group_id: groupId,
        sender_id: null,
        content: `New captain assigned due to inactivity. Welcome, captain! 🎖️`,
        type: 'system',
      })

    if (msgError) {
      console.error(`[reassign-captain] Failed to insert system message for group ${groupId}:`, msgError.message)
    }

    reassignedGroups.push(groupId)
  }

  // -------------------------------------------------------------------------
  // Step 3: Return summary
  // -------------------------------------------------------------------------
  return new Response(
    JSON.stringify({
      message: 'Captain reassignment completed successfully',
      reassignedCount: reassignedGroups.length,
      reassignedGroups,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
