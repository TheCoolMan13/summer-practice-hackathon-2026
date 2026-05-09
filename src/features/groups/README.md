# Groups Feature

This directory contains components related to group coordination and venue polling.

## VenuePoll Component

The `VenuePoll` component implements venue poll creation and voting functionality for group coordination.

### Features

- **Captain Poll Creation** (Requirement 11.3)
  - Only the group captain can create venue polls
  - Add multiple venue options with name, price, and distance
  - Automatically posts a system message in group chat when poll is created

- **Member Voting** (Requirement 11.4)
  - All group members can vote on venue options
  - One vote per user per poll (enforced by UNIQUE database constraint)
  - Users can change their vote at any time
  - Live vote counts displayed with percentage bars

### Database Schema

The component interacts with three tables:

```sql
-- Poll metadata
CREATE TABLE venue_polls (
  id         UUID PRIMARY KEY,
  group_id   UUID NOT NULL REFERENCES groups(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  status     TEXT CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venue options
CREATE TABLE venue_poll_options (
  id          UUID PRIMARY KEY,
  poll_id     UUID NOT NULL REFERENCES venue_polls(id),
  venue_name  TEXT NOT NULL,
  price_est   NUMERIC(10,2),
  distance_km DOUBLE PRECISION,
  votes       INT DEFAULT 0  -- Denormalized counter
);

-- User votes (UNIQUE constraint enforces one vote per user per poll)
CREATE TABLE venue_poll_votes (
  id        UUID PRIMARY KEY,
  poll_id   UUID NOT NULL REFERENCES venue_polls(id),
  option_id UUID NOT NULL REFERENCES venue_poll_options(id),
  user_id   UUID NOT NULL REFERENCES profiles(id),
  UNIQUE (poll_id, user_id)  -- Property 7: Vote uniqueness
);
```

### Row-Level Security

The component relies on RLS policies to enforce access control:

- **venue_polls_insert_captain**: Only the captain can create polls for their group
- **venue_poll_options_insert_captain**: Only the captain can add options to their polls
- **venue_poll_votes_insert_own**: Group members can only vote in polls for groups they belong to
- **venue_poll_votes_select_member**: Group members can see all votes in their group's polls

### Usage Example

```tsx
import VenuePoll from './features/groups/VenuePoll'

function GroupCoordinationPage({ groupId }: { groupId: string }) {
  const [showPoll, setShowPoll] = useState(false)

  return (
    <div>
      <h1>Group Coordination</h1>
      
      <button onClick={() => setShowPoll(!showPoll)}>
        {showPoll ? 'Hide' : 'Show'} Venue Poll
      </button>

      {showPoll && (
        <VenuePoll 
          groupId={groupId}
          onClose={() => setShowPoll(false)}
        />
      )}
    </div>
  )
}
```

### Integration with ChatRoom

The VenuePoll component can be integrated into the ChatRoom component to provide venue coordination alongside chat:

```tsx
import ChatRoom from './features/chat/ChatRoom'
import VenuePoll from './features/groups/VenuePoll'

function GroupPage({ groupId }: { groupId: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ flex: 1 }}>
        <ChatRoom groupId={groupId} />
      </div>
      <div style={{ flex: 1 }}>
        <VenuePoll groupId={groupId} />
      </div>
    </div>
  )
}
```

### Testing

The component includes unit tests that document the database constraints and RLS policies:

```bash
npm test -- src/features/groups/VenuePoll.test.ts
```

Tests verify:
- UNIQUE constraint on (poll_id, user_id) enforces one vote per user
- RLS policies restrict poll creation to captains
- RLS policies allow group members to vote
- Vote counts are updated correctly when users vote or change votes

### Future Enhancements (Task 16.2)

Task 16.2 will add real-time vote count updates via Supabase Realtime:

```tsx
// Subscribe to live vote count updates
useEffect(() => {
  const channel = supabase.channel(`group:${groupId}:poll`)
  
  channel
    .on('broadcast', { event: 'vote_update' }, (payload) => {
      // Update vote counts in real-time
      updateVoteCounts(payload.optionId, payload.votes)
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [groupId])
```

This will provide live updates to all group members when someone votes, without requiring a page refresh.
