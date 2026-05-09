// Feature: show-up-2-move
// Unit tests for the pure leave-group action logic.
// Task: 22.1 Implement leave group action
// Requirements: 16.2, 16.3

import { describe, it, expect, beforeEach } from 'vitest'
import { leaveGroupAction } from './leaveGroupAction'

// ── Test Supabase client builder ──────────────────────────────────────────
//
// We hand-roll a minimal stand-in for the Supabase client. This keeps the
// test self-contained and avoids the jsdom / @testing-library renderHook
// path (which this workspace's jsdom v27 currently breaks via an ESM/CJS
// bridge bug in @asamuzakjp/css-color).

interface FakeClientOptions {
  sport?: string
  /** Members still in the group *after* the caller has left. */
  remainingMembers?: Array<{ user_id: string }>
  /** Error to return from the DELETE call. */
  deleteError?: unknown
  /** Error to return from the profiles/groups fetch. */
  authError?: unknown
  currentUser?: { id: string } | null
}

function buildFakeClient(opts: FakeClientOptions = {}) {
  const {
    sport = 'basketball',
    remainingMembers = [],
    deleteError = null,
    authError = null,
    currentUser = { id: 'current-user' },
  } = opts

  const insertedMessages: any[] = []
  const insertedNotifications: any[][] = []

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: authError,
      }),
    },
    from: (table: string) => {
      switch (table) {
        case 'profiles':
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { display_name: 'Alex' },
                  error: null,
                }),
              }),
            }),
          }

        case 'groups':
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { sport },
                  error: null,
                }),
              }),
            }),
          }

        case 'group_members':
          return {
            // DELETE chain: .delete().eq().eq()
            delete: () => ({
              eq: () => ({
                eq: async () => ({ error: deleteError }),
              }),
            }),
            // SELECT remaining members chain: .select().eq()
            select: () => ({
              eq: async () => ({
                data: remainingMembers,
                error: null,
              }),
            }),
          }

        case 'messages':
          return {
            insert: async (row: any) => {
              insertedMessages.push(row)
              return { error: null }
            },
          }

        case 'notifications':
          return {
            insert: async (rows: any) => {
              insertedNotifications.push(rows)
              return { error: null }
            },
          }

        default:
          return {}
      }
    },
  }

  return { client, insertedMessages, insertedNotifications }
}

describe('leaveGroupAction', () => {
  let rejectsLogged = 0
  beforeEach(() => {
    rejectsLogged = 0
  })

  it("deletes the caller's membership and posts a system message (Req. 16.2)", async () => {
    // basketball min = 6; return 6 remaining so the min check is NOT triggered.
    const { client, insertedMessages, insertedNotifications } = buildFakeClient({
      sport: 'basketball',
      remainingMembers: Array.from({ length: 6 }, (_, i) => ({ user_id: `u${i}` })),
    })

    const result = await leaveGroupAction(client as any, 'group-1')

    expect(result.success).toBe(true)
    expect(result.error).toBeNull()

    // System message must have been inserted with type='system' and sender_id=null.
    expect(insertedMessages).toHaveLength(1)
    const msg = insertedMessages[0]
    expect(msg.group_id).toBe('group-1')
    expect(msg.type).toBe('system')
    expect(msg.sender_id).toBeNull()
    expect(msg.content).toMatch(/left the group/i)

    // No below-min notifications (remaining >= min_size).
    expect(insertedNotifications).toHaveLength(0)
    expect(rejectsLogged).toBe(0)
  })

  it('notifies remaining members when the group falls below min_size (Req. 16.3)', async () => {
    // basketball min = 6; return 5 remaining so we fall below the minimum.
    const { client, insertedNotifications } = buildFakeClient({
      sport: 'basketball',
      remainingMembers: Array.from({ length: 5 }, (_, i) => ({ user_id: `u${i}` })),
    })

    const result = await leaveGroupAction(client as any, 'group-1')

    expect(result.success).toBe(true)
    expect(insertedNotifications).toHaveLength(1)

    const notifications = insertedNotifications[0]
    // One notification per remaining member.
    expect(notifications).toHaveLength(5)
    // All notifications target remaining members and offer re-queue / cancel.
    for (const n of notifications) {
      expect(n.type).toBe('group_below_minimum')
      expect(n.data.group_id).toBe('group-1')
      expect(n.data.sport).toBe('basketball')
      expect(n.data.remaining).toBe(5)
      expect(n.data.min_size).toBe(6)
      expect(n.data.actions).toEqual(expect.arrayContaining(['requeue', 'cancel']))
    }
    // And each remaining member is covered exactly once.
    const targetIds = notifications.map((n: any) => n.user_id).sort()
    expect(targetIds).toEqual(['u0', 'u1', 'u2', 'u3', 'u4'])
  })

  it('skips the below-min check when the sport is unknown', async () => {
    const { client, insertedMessages, insertedNotifications } = buildFakeClient({
      sport: 'underwater-basket-weaving',
      remainingMembers: [{ user_id: 'u0' }],
    })

    const result = await leaveGroupAction(client as any, 'group-1')

    expect(result.success).toBe(true)
    // System message still posted, but no notifications because min_size is unknown.
    expect(insertedMessages).toHaveLength(1)
    expect(insertedNotifications).toHaveLength(0)
  })

  it('reports failure and does not post a system message when DELETE fails', async () => {
    const { client, insertedMessages, insertedNotifications } = buildFakeClient({
      deleteError: { message: 'permission denied' },
    })

    const result = await leaveGroupAction(client as any, 'group-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/failed to leave/i)
    expect(insertedMessages).toHaveLength(0)
    expect(insertedNotifications).toHaveLength(0)
  })

  it('boundary: exactly min_size remaining does NOT trigger below-min notifications', async () => {
    // basketball min = 6; exactly 6 remaining — N-1 (after leave) is not < min.
    const { client, insertedNotifications } = buildFakeClient({
      sport: 'basketball',
      remainingMembers: Array.from({ length: 6 }, (_, i) => ({ user_id: `u${i}` })),
    })

    const result = await leaveGroupAction(client as any, 'group-1')

    expect(result.success).toBe(true)
    expect(insertedNotifications).toHaveLength(0)
  })

  it('tennis min=2: dropping to 1 remaining triggers notification', async () => {
    const { client, insertedNotifications } = buildFakeClient({
      sport: 'tennis',
      remainingMembers: [{ user_id: 'u0' }],
    })

    const result = await leaveGroupAction(client as any, 'group-1')

    expect(result.success).toBe(true)
    expect(insertedNotifications).toHaveLength(1)
    const notifications = insertedNotifications[0]
    expect(notifications).toHaveLength(1)
    expect(notifications[0].data.sport).toBe('tennis')
    expect(notifications[0].data.min_size).toBe(2)
    expect(notifications[0].data.remaining).toBe(1)
  })
})
