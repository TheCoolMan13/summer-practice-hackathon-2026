// Feature: show-up-2-move
// Unit tests for event actions
// Requirements: 5.6, 10.4, 10.5

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { supabase } from '../../lib/supabaseClient'
import { useEventActions } from './useEventActions'

// Mock the Supabase client
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

describe('useEventActions - joinEvent logic', () => {
  const mockUserId = 'user-123'
  const mockEventId = 'event-456'
  const mockOrganizerId = 'organizer-789'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should successfully join an event with available capacity', async () => {
    // Mock authenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: mockUserId } as any },
      error: null,
    })

    // Mock event fetch - event with 5/10 participants
    const mockEventData = {
      id: mockEventId,
      organizer_id: mockOrganizerId,
      participant_limit: 10,
      status: 'open',
      sport: 'football',
      title: 'Sunday Match',
      start_time: '2024-06-15T10:00:00Z',
      profiles: { display_name: 'John Doe' },
      event_participants: [
        { user_id: 'other-1', status: 'joined' },
        { user_id: 'other-2', status: 'joined' },
        { user_id: 'other-3', status: 'joined' },
        { user_id: 'other-4', status: 'joined' },
        { user_id: 'other-5', status: 'joined' },
      ],
    }

    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({
      data: mockEventData,
      error: null,
    })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnThis()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
          update: mockUpdate,
        } as any
      }
      if (table === 'event_participants' || table === 'notifications') {
        return {
          insert: mockInsert,
        } as any
      }
      return {} as any
    })

    // Call the hook's joinEvent function directly
    const hook = useEventActions()
    const result = await hook.joinEvent(mockEventId)

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.isFull).toBeUndefined()
  })

  it('should reject join when event is full (Requirement 10.5)', async () => {
    // Mock authenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: mockUserId } as any },
      error: null,
    })

    // Mock event fetch - event with 10/10 participants (FULL)
    const mockEventData = {
      id: mockEventId,
      organizer_id: mockOrganizerId,
      participant_limit: 10,
      status: 'open',
      sport: 'football',
      title: 'Sunday Match',
      start_time: '2024-06-15T10:00:00Z',
      profiles: { display_name: 'John Doe' },
      event_participants: Array.from({ length: 10 }, (_, i) => ({
        user_id: `user-${i}`,
        status: 'joined',
      })),
    }

    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({
      data: mockEventData,
      error: null,
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
        } as any
      }
      return {} as any
    })

    const hook = useEventActions()
    const result = await hook.joinEvent(mockEventId)

    expect(result.success).toBe(false)
    expect(result.isFull).toBe(true)
    expect(result.error).toBe('Event is full')
  })

  it('should reject join when user is already a participant', async () => {
    // Mock authenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: mockUserId } as any },
      error: null,
    })

    // Mock event fetch - user is already in the participant list
    const mockEventData = {
      id: mockEventId,
      organizer_id: mockOrganizerId,
      participant_limit: 10,
      status: 'open',
      sport: 'football',
      title: 'Sunday Match',
      start_time: '2024-06-15T10:00:00Z',
      profiles: { display_name: 'John Doe' },
      event_participants: [
        { user_id: mockUserId, status: 'joined' }, // Current user already joined
        { user_id: 'other-1', status: 'joined' },
      ],
    }

    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({
      data: mockEventData,
      error: null,
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
        } as any
      }
      return {} as any
    })

    const hook = useEventActions()
    const result = await hook.joinEvent(mockEventId)

    expect(result.success).toBe(false)
    expect(result.error).toBe('You have already joined this event')
  })

  it('should exclude cancelled participants from capacity check', async () => {
    // Mock authenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: mockUserId } as any },
      error: null,
    })

    // Mock event fetch - 10 total participants but 3 cancelled, so 7 active (not full)
    const mockEventData = {
      id: mockEventId,
      organizer_id: mockOrganizerId,
      participant_limit: 10,
      status: 'open',
      sport: 'football',
      title: 'Sunday Match',
      start_time: '2024-06-15T10:00:00Z',
      profiles: { display_name: 'John Doe' },
      event_participants: [
        { user_id: 'user-1', status: 'joined' },
        { user_id: 'user-2', status: 'joined' },
        { user_id: 'user-3', status: 'joined' },
        { user_id: 'user-4', status: 'joined' },
        { user_id: 'user-5', status: 'joined' },
        { user_id: 'user-6', status: 'joined' },
        { user_id: 'user-7', status: 'joined' },
        { user_id: 'user-8', status: 'cancelled' }, // Cancelled
        { user_id: 'user-9', status: 'cancelled' }, // Cancelled
        { user_id: 'user-10', status: 'cancelled' }, // Cancelled
      ],
    }

    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({
      data: mockEventData,
      error: null,
    })
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnThis()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
          update: mockUpdate,
        } as any
      }
      if (table === 'event_participants' || table === 'notifications') {
        return {
          insert: mockInsert,
        } as any
      }
      return {} as any
    })

    const hook = useEventActions()
    const result = await hook.joinEvent(mockEventId)

    // Should succeed because only 7 active participants (< 10 limit)
    expect(result.success).toBe(true)
  })

  it('should notify organizer when user joins (Requirement 10.4)', async () => {
    // Mock authenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: mockUserId } as any },
      error: null,
    })

    // Mock event fetch
    const mockEventData = {
      id: mockEventId,
      organizer_id: mockOrganizerId,
      participant_limit: 10,
      status: 'open',
      sport: 'football',
      title: 'Sunday Match',
      start_time: '2024-06-15T10:00:00Z',
      profiles: { display_name: 'John Doe' },
      event_participants: [{ user_id: 'other-1', status: 'joined' }],
    }

    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({
      data: mockEventData,
      error: null,
    })

    const mockNotificationInsert = vi.fn().mockResolvedValue({ error: null })
    const mockParticipantInsert = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnThis()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
          update: mockUpdate,
        } as any
      }
      if (table === 'event_participants') {
        return {
          insert: mockParticipantInsert,
        } as any
      }
      if (table === 'notifications') {
        return {
          insert: mockNotificationInsert,
        } as any
      }
      return {} as any
    })

    const hook = useEventActions()
    await hook.joinEvent(mockEventId)

    // Verify notification was sent to organizer
    expect(mockNotificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: mockOrganizerId,
        type: 'event_join',
        title: 'New participant joined',
        data: expect.objectContaining({
          event_id: mockEventId,
          participant_id: mockUserId,
        }),
      }),
    )
  })

  it('should require authentication', async () => {
    // Mock unauthenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as any)

    const hook = useEventActions()
    const result = await hook.joinEvent(mockEventId)

    expect(result.success).toBe(false)
    expect(result.error).toBe('You must be logged in to join an event')
  })

  it('should handle event not found', async () => {
    // Mock authenticated user
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: mockUserId } as any },
      error: null,
    })

    // Mock event fetch - event not found
    const mockSelect = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
        } as any
      }
      return {} as any
    })

    const hook = useEventActions()
    const result = await hook.joinEvent(mockEventId)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })
})
