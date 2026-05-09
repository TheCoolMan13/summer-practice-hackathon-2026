# Notifications Feature

This feature provides real-time notification delivery and management for the ShowUp2Move platform.

## Overview

The notifications feature enables users to receive real-time updates about:
- New group matches (Requirement 12.1)
- Event confirmations (Requirement 12.2)
- New messages in group chats (Requirement 12.3)
- Event cancellations (Requirement 12.4)
- Venue updates (Requirement 12.6)

## Components

### `useNotifications` Hook

A React hook that manages notification state, real-time subscriptions, and read status.

#### Features

- **Real-time delivery**: Subscribes to `user:{user_id}:notifications` channel for instant notification delivery
- **Automatic fetching**: Loads all notifications on mount, ordered by creation time (newest first)
- **Read status management**: Mark individual or all notifications as read
- **Unread count**: Provides a count of unread notifications for badge display
- **Error handling**: Gracefully handles authentication and database errors
- **Reconnection**: Automatically re-fetches notifications when the real-time connection is restored

#### Usage

```typescript
import { useNotifications } from './features/notifications/useNotifications'

function NotificationBell() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotifications()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <button>
        Notifications {unreadCount > 0 && `(${unreadCount})`}
      </button>
      <ul>
        {notifications.map((notif) => (
          <li
            key={notif.id}
            onClick={() => markAsRead(notif.id)}
            style={{ fontWeight: notif.read ? 'normal' : 'bold' }}
          >
            <h4>{notif.title}</h4>
            <p>{notif.body}</p>
          </li>
        ))}
      </ul>
      <button onClick={markAllAsRead}>Mark all as read</button>
    </div>
  )
}
```

#### Return Value

```typescript
interface UseNotificationsReturn {
  notifications: Notification[]  // All notifications, newest first
  unreadCount: number             // Count of unread notifications
  loading: boolean                // Loading state
  error: string | null            // Error message, if any
  markAsRead: (id: string) => Promise<void>  // Mark one notification as read
  markAllAsRead: () => Promise<void>         // Mark all notifications as read
  refresh: () => Promise<void>               // Manually refresh notifications
}
```

#### Notification Type

```typescript
interface Notification {
  id: string
  user_id: string
  type: string  // 'match_found' | 'captain_assigned' | 'event_confirmed' | ...
  title: string
  body: string
  data: Record<string, unknown>  // Arbitrary payload (group_id, event_id, etc.)
  read: boolean
  created_at: string
}
```

## Real-time Subscription

The hook subscribes to Supabase Realtime using the `user:{user_id}:notifications` channel pattern. It listens for:

1. **INSERT events**: New notifications are prepended to the list (newest first)
2. **UPDATE events**: Existing notifications are updated in place (e.g., when marked as read)

The subscription automatically handles:
- Connection errors (displays error message)
- Timeouts (logs warning)
- Reconnection (re-fetches all notifications to ensure consistency)

## Database Schema

Notifications are stored in the `notifications` table:

```sql
CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       DEFAULT '{}',
  read       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Row-Level Security (RLS) policies ensure users can only see their own notifications.

## Testing

The feature includes comprehensive unit tests covering:
- Notification retrieval and ordering
- Unread count calculation
- Mark as read functionality (individual and bulk)
- Authentication error handling
- Real-time subscription setup
- Duplicate prevention
- Error handling

Run tests with:
```bash
npm test -- src/features/notifications/useNotifications.test.ts
```

## Requirements Validation

This implementation satisfies the following requirements:

- **12.1**: Real-time in-app notification delivery within 3 seconds of group creation
- **12.2**: Real-time notification delivery within 3 seconds of event confirmation
- **12.3**: Real-time notification for new messages when user is not viewing the chat
- **12.4**: Real-time notification within 3 seconds of event cancellation
- **12.6**: Real-time notification for venue updates

## Future Enhancements

Potential improvements for future iterations:
- Notification grouping by type
- Notification filtering
- Notification preferences (per-type opt-in/opt-out)
- Push notifications (browser/mobile)
- Notification sound effects
- Notification persistence across sessions
