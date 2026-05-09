# Group Chat Feature

This feature implements real-time group chat functionality for ShowUp2Move groups.

## Components

### `ChatRoom`

Full chat UI component with message display, input, and emoji reactions.

**Props:**
- `groupId: string` - The ID of the group to display chat for

**Features:**
- Message list with sender information (display names from profiles)
- Real-time message updates via Supabase Realtime
- Emoji reactions (👍 ❤️ 😂 🔥 👏) stored as JSONB
- System messages styled differently (join/leave/confirm events)
- Empty state when no messages exist
- Auto-scroll to latest message
- Message input with send button

**Requirements:**
- 9.3 - System messages displayed in visually distinct style
- 9.4 - Captain confirmation system messages
- 9.5 - Message reactions using predefined emoji set
- 9.7 - Empty state when no messages exist

**Usage:**

```tsx
import ChatRoom from './features/chat/ChatRoom'

// Basic usage in a group page
function GroupPage({ groupId }: { groupId: string }) {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Group Chat</h1>
      <ChatRoom groupId={groupId} />
    </div>
  )
}

// Usage in an event detail page
function EventDetailPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState(null)
  
  useEffect(() => {
    // Fetch event details including group_id
    const fetchEvent = async () => {
      const { data } = await supabase
        .from('events')
        .select('*, group_id')
        .eq('id', eventId)
        .single()
      setEvent(data)
    }
    fetchEvent()
  }, [eventId])
  
  if (!event) return <div>Loading...</div>
  
  return (
    <div>
      <h1>{event.title}</h1>
      {/* Event details */}
      
      {/* Show chat if event has a group */}
      {event.group_id && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Group Chat</h2>
          <ChatRoom groupId={event.group_id} />
        </section>
      )}
    </div>
  )
}
```

### `useGroupChat`

Hook for managing group chat messages and real-time subscriptions.

**Parameters:**
- `groupId: string` - The ID of the group

**Returns:**
- `messages: Message[]` - Array of messages (last 50, ordered by created_at ASC)
- `loading: boolean` - Loading state
- `error: string | null` - Error message if any
- `sendMessage: (content: string) => Promise<void>` - Send a new message
- `refresh: () => Promise<void>` - Manually refresh messages

**Requirements:**
- 9.2 - Message broadcasting within 500ms
- 9.6 - Return last 50 messages in chronological order
- 9.7 - Empty state handling

## Database Schema

### `messages` table

```sql
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES profiles(id),  -- NULL for system messages
  content    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'user'
               CHECK (type IN ('user', 'system')),
  reactions  JSONB DEFAULT '{}',  -- { "👍": ["user_id1", ...], ... }
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Reactions Format

Reactions are stored as JSONB with emoji as keys and arrays of user IDs as values:

```json
{
  "👍": ["user-id-1", "user-id-2"],
  "❤️": ["user-id-3"],
  "🔥": ["user-id-1", "user-id-4"]
}
```

## System Messages

System messages have `type='system'` and `sender_id=NULL`. They are displayed in a visually distinct style (gray background, centered, italic).

Examples:
- "Alice joined the group"
- "Bob left the group"
- "Basketball match confirmed"
- "New captain assigned"

## Real-time Updates

The `useGroupChat` hook subscribes to Supabase Realtime for live message updates:

```typescript
supabase
  .channel(`group:${groupId}:messages`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `group_id=eq.${groupId}`,
  }, (payload) => {
    // Append new message to local state
  })
  .subscribe()
```

## Testing

The `useGroupChat` hook has comprehensive unit tests covering:
- Message retrieval (last 50 messages)
- Message sending with auth validation
- Empty message rejection
- Realtime subscription setup and cleanup
- Message deduplication
- 50-message limit enforcement

Run tests:
```bash
npm test -- src/features/chat/useGroupChat.test.ts
```

## Future Enhancements

- Message editing and deletion
- File/image attachments
- Typing indicators
- Read receipts
- Message search
- Thread replies
