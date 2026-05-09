// Feature: show-up-2-move
// Pure "leave group" action — decoupled from React and the singleton client
// so it can be unit-tested without pulling in @supabase/supabase-js
// (whose RealtimeClient refuses to construct under Node 20 without `ws`).
// Task: 22.1 Implement leave group action
// Requirements: 16.2, 16.3

import type { SupabaseClient } from '@supabase/supabase-js'
import { minSizeFor } from '../../lib/sportSizes'

export interface LeaveGroupResult {
  /** True if the user was successfully removed from `group_members`. */
  success: boolean
  /** User-facing error message when `success === false`, otherwise null. */
  error: string | null
}

/**
 * Core "leave group" behaviour.
 *
 * Performs, in order:
 *  1. DELETE from `group_members` (RLS-scoped to the caller's own row).
 *  2. INSERT a system message "<display name> left the group" into
 *     `messages` so remaining members see the change in chat. (Req. 16.2)
 *  3. Re-evaluate remaining group size: if it falls below
 *     `min_size(sport)`, INSERT a notification for every remaining member
 *     offering re-queue or cancel options. (Req. 16.3)
 *
 * Non-fatal failures in step 2/3 log a warning but still resolve with
 * `success: true`, because the user has already been removed from the
 * group.
 */
export async function leaveGroupAction(
  client: SupabaseClient,
  groupId: string,
): Promise<LeaveGroupResult> {
  // 0. Resolve the caller.
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'You must be logged in to leave a group.' }
  }

  // Fetch the caller's display name and the group's sport in parallel.
  const [{ data: profile }, { data: group }] = await Promise.all([
    client.from('profiles').select('display_name').eq('id', user.id).single(),
    client.from('groups').select('sport').eq('id', groupId).single(),
  ])

  const displayName: string = profile?.display_name ?? 'A member'
  const sport: string | undefined = group?.sport

  // 1. DELETE from group_members.
  const { error: deleteError } = await client
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id)

  if (deleteError) {
    return {
      success: false,
      error: 'Failed to leave the group. Please try again.',
    }
  }

  // 2. Post a system message. (Req. 16.2)
  const systemMessage = `${displayName} left the group`
  const { error: messageError } = await client.from('messages').insert({
    group_id: groupId,
    sender_id: null,
    content: systemMessage,
    type: 'system',
  })

  if (messageError) {
    console.warn('Failed to post leave system message:', messageError)
  }

  // 3. Re-evaluate group size. (Req. 16.3)
  //
  // Only gate on known sports — unknown sports have no defined minimum
  // so we skip the notification step instead of guessing.
  const minSize = sport ? minSizeFor(sport) : undefined

  if (minSize !== undefined) {
    const { data: remaining, error: remainingError } = await client
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)

    if (!remainingError && remaining && remaining.length < minSize) {
      const notifications = (remaining as Array<{ user_id: string }>).map(
        (m) => ({
          user_id: m.user_id,
          type: 'group_below_minimum',
          title: 'Group below minimum size',
          body: `Your ${sport} group no longer meets the minimum of ${minSize} players. You can re-queue for matching or cancel.`,
          data: {
            group_id: groupId,
            sport,
            remaining: remaining.length,
            min_size: minSize,
            actions: ['requeue', 'cancel'],
          },
        }),
      )

      if (notifications.length > 0) {
        const { error: notifyError } = await client
          .from('notifications')
          .insert(notifications)

        if (notifyError) {
          console.warn(
            'Failed to notify remaining members of below-min group:',
            notifyError,
          )
        }
      }
    }
  }

  return { success: true, error: null }
}
