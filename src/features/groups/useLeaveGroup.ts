// Feature: show-up-2-move
// React hook wrapping the "leave group" action.
// Task: 22.1 Implement leave group action
// Requirements: 16.2, 16.3

import { useCallback, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { leaveGroupAction } from './leaveGroupAction'

interface UseLeaveGroupReturn {
  /** True while a leave request is in flight. */
  leaving: boolean
  /** Most recent error message, or null. */
  error: string | null
  /**
   * Remove the current user from the given group. Returns `true` on
   * success, `false` if the DELETE failed (in which case `error` is set).
   */
  leaveGroup: (groupId: string) => Promise<boolean>
}

/**
 * useLeaveGroup
 *
 * Thin React wrapper around {@link leaveGroupAction} that exposes
 * `leaving` and `error` as component-level state. The hook does not take
 * a userId because the current user is always derived from Supabase Auth,
 * and RLS enforces that only the caller's own membership row can be
 * deleted.
 */
export function useLeaveGroup(): UseLeaveGroupReturn {
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const leaveGroup = useCallback(async (groupId: string): Promise<boolean> => {
    setLeaving(true)
    setError(null)
    try {
      const result = await leaveGroupAction(supabase, groupId)
      if (!result.success) setError(result.error)
      return result.success
    } finally {
      setLeaving(false)
    }
  }, [])

  return { leaving, error, leaveGroup }
}
