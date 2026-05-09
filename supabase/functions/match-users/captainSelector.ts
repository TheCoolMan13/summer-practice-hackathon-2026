// Feature: show-up-2-move
// Captain selection logic for the match-users Edge Function.
// Requirements: 8.1, 8.2, 8.3

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * selectCaptain
 *
 * Selects a captain from the group members using weighted random selection.
 * Users who appear in their last 3 captain_history entries have reduced weight.
 *
 * Algorithm:
 * 1. Query captain_history for each member to get their recent captain count
 * 2. Assign weights: base weight 3 for all; reduce by 1 for each of the last 3 entries
 *    (so a user who was captain in all 3 recent groups gets weight 0 — excluded)
 * 3. Weighted random selection
 * 4. INSERT into captain_history
 * 5. UPDATE groups.captain_id
 * 6. INSERT "You are the captain" notification
 *
 * Returns the selected captain's user_id.
 */
export async function selectCaptain(
  supabase: SupabaseClient,
  groupId: string,
  memberIds: string[],
): Promise<string> {
  if (memberIds.length === 0) throw new Error('No members to select captain from')
  if (memberIds.length === 1) {
    await assignCaptain(supabase, groupId, memberIds[0])
    return memberIds[0]
  }

  // Step 1: Query recent captain history for all members
  const { data: historyRows } = await supabase
    .from('captain_history')
    .select('user_id, assigned_at')
    .in('user_id', memberIds)
    .order('assigned_at', { ascending: false })

  // Count how many of the last 3 entries each user appears in
  const recentCaptainCount: Record<string, number> = {}
  for (const memberId of memberIds) {
    const userHistory = (historyRows ?? [])
      .filter((row: { user_id: string }) => row.user_id === memberId)
      .slice(0, 3)
    recentCaptainCount[memberId] = userHistory.length
  }

  // Step 2: Assign weights (base 3, reduce by recent captain count)
  const weights: { userId: string; weight: number }[] = memberIds.map((id) => ({
    userId: id,
    weight: Math.max(0, 3 - (recentCaptainCount[id] ?? 0)),
  }))

  // If all weights are 0 (everyone was captain recently), reset to equal weights
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  const effectiveWeights = totalWeight === 0
    ? memberIds.map((id) => ({ userId: id, weight: 1 }))
    : weights

  // Step 3: Weighted random selection
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

  // Steps 4-6: Assign captain
  await assignCaptain(supabase, groupId, selectedCaptain)
  return selectedCaptain
}

async function assignCaptain(
  supabase: SupabaseClient,
  groupId: string,
  captainId: string,
): Promise<void> {
  // INSERT into captain_history
  await supabase.from('captain_history').insert({
    user_id: captainId,
    group_id: groupId,
  })

  // UPDATE groups.captain_id
  await supabase.from('groups').update({ captain_id: captainId }).eq('id', groupId)

  // INSERT "You are the captain" notification
  await supabase.from('notifications').insert({
    user_id: captainId,
    type: 'captain_assigned',
    title: 'You are the captain! 🎖️',
    body: 'You have been selected as the captain for your group. Confirm the event to get started.',
    data: { group_id: groupId },
  })
}
