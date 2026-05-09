// Feature: show-up-2-move
// Hook that fetches the groups the current user belongs to.
// Requirements: 9.1, 9.2 (enables reachability of group chat)

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export interface MyGroup {
  id: string
  sport: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  captain_id: string | null
  event_id: string | null
  created_at: string
  member_count: number
  event_title: string | null
  event_start_time: string | null
  event_location_name: string | null
  unread_messages: number
  last_message_preview: string | null
  last_message_at: string | null
}

interface UseMyGroupsReturn {
  groups: MyGroup[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * useMyGroups
 *
 * Fetches the list of groups the authenticated user belongs to, together
 * with enough metadata to display a useful list item (sport, member count,
 * linked event, most recent message preview).
 *
 * RLS on `groups` already restricts SELECT to members via the
 * `groups_select_member` policy, but we query through `group_members`
 * first to keep the result focused on the caller's own memberships.
 */
export function useMyGroups(): UseMyGroupsReturn {
  const [groups, setGroups] = useState<MyGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        setError('You must be logged in to view your groups.')
        setGroups([])
        return
      }

      // 1. All group IDs for the current user.
      const { data: memberships, error: memberError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)

      if (memberError) {
        setError('Failed to load your groups.')
        setGroups([])
        return
      }

      const groupIds = (memberships ?? []).map((m) => m.group_id)
      if (groupIds.length === 0) {
        setGroups([])
        return
      }

      // 2. Group rows.
      const { data: groupRows, error: groupsError } = await supabase
        .from('groups')
        .select('id, sport, status, captain_id, event_id, created_at')
        .in('id', groupIds)
        .order('created_at', { ascending: false })

      if (groupsError) {
        setError('Failed to load your groups.')
        setGroups([])
        return
      }

      // 2b. Linked events fetched separately (avoids relying on a specific
      //     FK constraint name for the PostgREST join).
      const linkedEventIds = (groupRows ?? [])
        .map((g) => g.event_id)
        .filter((id): id is string => Boolean(id))

      const eventsById = new Map<
        string,
        { title: string | null; start_time: string; location_name: string | null }
      >()
      if (linkedEventIds.length > 0) {
        const { data: eventRows } = await supabase
          .from('events')
          .select('id, title, start_time, location_name')
          .in('id', linkedEventIds)
        for (const ev of eventRows ?? []) {
          eventsById.set(ev.id, {
            title: ev.title,
            start_time: ev.start_time,
            location_name: ev.location_name,
          })
        }
      }

      // 3. Member counts (one round trip per group is fine for small sets).
      const counts = await Promise.all(
        groupIds.map(async (gid) => {
          const { count } = await supabase
            .from('group_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('group_id', gid)
          return { gid, count: count ?? 0 }
        }),
      )
      const countByGroup = new Map(counts.map((c) => [c.gid, c.count]))

      // 4. Most recent message per group (for preview + ordering signal).
      const lastMsgByGroup = new Map<
        string,
        { content: string; created_at: string }
      >()
      await Promise.all(
        groupIds.map(async (gid) => {
          const { data } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('group_id', gid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (data) {
            lastMsgByGroup.set(gid, {
              content: data.content,
              created_at: data.created_at,
            })
          }
        }),
      )

      const rows = (groupRows ?? []) as any[]
      const mapped: MyGroup[] = rows.map((row) => {
        const ev = row.event_id ? eventsById.get(row.event_id) ?? null : null
        const lastMsg = lastMsgByGroup.get(row.id) ?? null
        return {
          id: row.id,
          sport: row.sport,
          status: row.status,
          captain_id: row.captain_id,
          event_id: row.event_id,
          created_at: row.created_at,
          member_count: countByGroup.get(row.id) ?? 0,
          event_title: ev?.title ?? null,
          event_start_time: ev?.start_time ?? null,
          event_location_name: ev?.location_name ?? null,
          unread_messages: 0, // reserved for future read-tracking
          last_message_preview: lastMsg?.content ?? null,
          last_message_at: lastMsg?.created_at ?? null,
        }
      })

      // Sort by last-message timestamp desc, falling back to created_at.
      mapped.sort((a, b) => {
        const aT = a.last_message_at ?? a.created_at
        const bT = b.last_message_at ?? b.created_at
        return bT.localeCompare(aT)
      })

      setGroups(mapped)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { groups, loading, error, refresh }
}
