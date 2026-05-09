// Feature: show-up-2-move
// Unit tests for NotificationBell component
// Requirements: 12.1, 14.5

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationBell from './NotificationBell'
import * as useNotificationsModule from './useNotifications'

// Mock the useNotifications hook
vi.mock('./useNotifications')

describe('NotificationBell', () => {
  const mockUseNotifications = vi.mocked(useNotificationsModule.useNotifications)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display unread badge count when there are unread notifications (Requirement 12.1)', () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: '1',
          user_id: 'user1',
          type: 'match_found',
          title: 'Match found',
          body: 'You have been matched',
          data: {},
          read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          user_id: 'user1',
          type: 'event_confirmed',
          title: 'Event confirmed',
          body: 'Your event is confirmed',
          data: {},
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 2,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const badge = screen.getByText('2')
    expect(badge).toBeInTheDocument()
  })

  it('should not display badge when there are no unread notifications', () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: '1',
          user_id: 'user1',
          type: 'match_found',
          title: 'Match found',
          body: 'You have been matched',
          data: {},
          read: true,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 0,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('should display "99+" when unread count exceeds 99', () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 150,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const badge = screen.getByText('99+')
    expect(badge).toBeInTheDocument()
  })

  it('should open dropdown when bell icon is clicked', async () => {
    const user = userEvent.setup()
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: '1',
          user_id: 'user1',
          type: 'match_found',
          title: 'Match found',
          body: 'You have been matched',
          data: {},
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const bellButton = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bellButton)

    await waitFor(() => {
      expect(screen.getByText('Match found')).toBeInTheDocument()
    })
  })

  it('should display empty state when there are no notifications', async () => {
    const user = userEvent.setup()
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const bellButton = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bellButton)

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    })
  })

  it('should call markAsRead when a notification is clicked', async () => {
    const user = userEvent.setup()
    const mockMarkAsRead = vi.fn()
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: '1',
          user_id: 'user1',
          type: 'match_found',
          title: 'Match found',
          body: 'You have been matched',
          data: {},
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      loading: false,
      error: null,
      markAsRead: mockMarkAsRead,
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const bellButton = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bellButton)

    await waitFor(() => {
      expect(screen.getByText('Match found')).toBeInTheDocument()
    })

    const notification = screen.getByText('Match found')
    await user.click(notification)

    expect(mockMarkAsRead).toHaveBeenCalledWith('1')
  })

  it('should call markAllAsRead when "Mark all as read" button is clicked', async () => {
    const user = userEvent.setup()
    const mockMarkAllAsRead = vi.fn()
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: '1',
          user_id: 'user1',
          type: 'match_found',
          title: 'Match found',
          body: 'You have been matched',
          data: {},
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: mockMarkAllAsRead,
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const bellButton = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bellButton)

    await waitFor(() => {
      expect(screen.getByText('Mark all as read')).toBeInTheDocument()
    })

    const markAllButton = screen.getByText('Mark all as read')
    await user.click(markAllButton)

    expect(mockMarkAllAsRead).toHaveBeenCalled()
  })

  it('should display AI degradation toast when aiDegraded is true (Requirement 14.5)', async () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell aiDegraded={true} />)

    await waitFor(() => {
      expect(
        screen.getByText('AI features temporarily unavailable'),
      ).toBeInTheDocument()
    })
  })

  it('should call onAIDegraded callback when AI is degraded', async () => {
    const mockOnAIDegraded = vi.fn()
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell aiDegraded={true} onAIDegraded={mockOnAIDegraded} />)

    await waitFor(() => {
      expect(mockOnAIDegraded).toHaveBeenCalled()
    })
  })

  it('should display loading state', async () => {
    const user = userEvent.setup()
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loading: true,
      error: null,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const bellButton = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bellButton)

    await waitFor(() => {
      expect(screen.getByText('Loading notifications...')).toBeInTheDocument()
    })
  })

  it('should display error state', async () => {
    const user = userEvent.setup()
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: 'Failed to load notifications',
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refetch: vi.fn(),
    })

    render(<NotificationBell />)

    const bellButton = screen.getByRole('button', { name: /Notifications/ })
    await user.click(bellButton)

    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications')).toBeInTheDocument()
    })
  })
})
