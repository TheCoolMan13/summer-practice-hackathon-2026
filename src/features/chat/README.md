# Group Chat Feature

## useGroupChat Hook

The `useGroupChat` hook provides message persistence and retrieval for group chat rooms.

### Features

- Fetches the last 50 messages in chronological order (Requirement 9.6)
- Sends messages with authenticated user as sender (Requirement 9.2)
- Supports empty state detection (Requirement 9.7)

### Usage

```typescript
import { useGroupChat } from './useGroupChat'

function ChatRoom({ groupId }: { groupId: string }) {
  const { messages, loading, error, sendMessage, refresh } = useGroupChat(groupId)

  const handleSend = async (content: string) => {
    await sendMessage(content)
  }

  if (loading) return <div>Loading messages...</div>
  if (error) return <div>Error: {error}</div>

  // Empty state (Requirement 9.7)
  if (messages.length === 0) {
    return <div>No messages yet. Start the conversation!</div>
  }

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.sender_id || 'System'}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => handleSend('Hello!')}>Send</button>
    </div>
  )
}
```

### API

#### Return Value

- `messages: Message[]` - Array of the last 50 messages in chronological order
- `loading: boolean` - Loading state for fetch/send operations
- `error: string | null` - Error message if an operation fails
- `sendMessage: (content: string) => Promise<void>` - Send a new message
- `refresh: () => Promise<void>` - Manually refresh messages from database

#### Message Type

```typescript
interface Message {
  id: string
  group_id: string
  sender_id: string | null  // null for system messages
  content: string
  type: 'user' | 'system'
  reactions: Record<string, string[]>
  created_at: string
}
```

### Requirements Satisfied

- **9.2**: Messages are sent with `sender_id = auth.uid()` and `type='user'`
- **9.6**: Returns the last 50 messages in chronological order
- **9.7**: Supports empty state detection (returns empty array when no messages)
