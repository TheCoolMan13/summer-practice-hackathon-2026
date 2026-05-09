# Venue Poll Live Vote Count Updates Implementation

## Task 16.2: Implement live vote count updates via Realtime

**Status:** ✅ COMPLETE

**Requirements Implemented:**
- Requirement 11.3: Venue poll creation and voting with UNIQUE constraint
- Requirement 11.4: Live vote count updates via Realtime Broadcast

---

## Implementation Summary

This task implements real-time vote count updates for venue polls using Supabase Realtime Broadcast channels. When a user casts a vote, all group members see the updated vote counts immediately without needing to refresh.

### Key Components

#### 1. **useVenuePoll Hook** (`src/features/chat/useVenuePoll.ts`)

The core hook that manages venue poll state and real-time subscriptions.

**Features:**
- Fetches active polls for a group
- Manages user vote state
- Subscribes to Realtime Broadcast channel: `group:{group_id}:poll`
- Broadcasts vote count updates when a user votes
- Handles vote uniqueness via upsert with conflict resolution

**Key Functions:**
- `fetchPoll()`: Loads poll data, options, and user's current vote
- `castVote(optionId)`: Casts or changes a vote, recalculates counts, and broadcasts updates
- Realtime subscription: Listens for `vote_update` events and updates local state

**Channel Format:**
```typescript
const channelName = `group:${groupId}:poll`
```

**Broadcast Payload:**
```typescript
{
  type: 'broadcast',
  event: 'vote_update',
  payload: {
    voteCounts: {
      'option-1': 5,
      'option-2': 3,
      'option-3': 2
    }
  }
}
```

#### 2. **VenuePoll Component** (`src/features/chat/VenuePoll.tsx`)

The UI component that displays the poll and handles user interactions.

**Features:**
- Displays poll options with venue name, price, and distance
- Shows live vote counts with visual progress bars
- Highlights user's current vote
- Calculates and displays vote percentages
- Responsive hover effects
- Handles closed poll state

**Visual Elements:**
- Vote count badges
- Percentage progress bars
- "Your vote" indicator
- Total votes counter
- Poll status indicator

#### 3. **Integration with ChatRoom**

The VenuePoll component is integrated into the ChatRoom component:

```typescript
<VenuePoll groupId={groupId} />
```

This ensures that all group members see the same poll and receive live updates.

---

## Technical Implementation Details

### Realtime Broadcast Subscription

The hook sets up a Realtime subscription when the component mounts:

```typescript
useEffect(() => {
  if (!groupId) return

  let channel: RealtimeChannel | null = null

  const setupRealtimeSubscription = async () => {
    channel = supabase.channel(`group:${groupId}:poll`)

    channel
      .on('broadcast', { event: 'vote_update' }, (payload) => {
        if (payload.payload?.voteCounts) {
          setVoteCounts(payload.payload.voteCounts)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to group:${groupId}:poll channel`)
        }
      })
  }

  setupRealtimeSubscription()

  return () => {
    if (channel) {
      supabase.removeChannel(channel)
    }
  }
}, [groupId])
```

### Vote Broadcasting

When a user casts a vote, the hook broadcasts the updated counts:

```typescript
const castVote = async (optionId: string) => {
  // ... vote logic ...

  // Recalculate vote counts from database
  const { data: allVotes } = await supabase
    .from('venue_poll_votes')
    .select('option_id')
    .eq('poll_id', poll.id)

  if (allVotes) {
    const newCounts: VoteCounts = {}
    poll.options.forEach((option) => {
      newCounts[option.id] = 0
    })
    allVotes.forEach((vote) => {
      newCounts[vote.option_id] = (newCounts[vote.option_id] || 0) + 1
    })
    setVoteCounts(newCounts)

    // Broadcast updated vote counts to all group members
    const channel = supabase.channel(`group:${groupId}:poll`)
    await channel.send({
      type: 'broadcast',
      event: 'vote_update',
      payload: { voteCounts: newCounts },
    })
  }
}
```

### Vote Uniqueness

Vote uniqueness is enforced using Supabase's upsert with conflict resolution:

```typescript
const { error: voteError } = await supabase
  .from('venue_poll_votes')
  .upsert(
    {
      poll_id: poll.id,
      option_id: optionId,
      user_id: user.id,
    },
    {
      onConflict: 'poll_id,user_id',
    }
  )
```

This ensures:
- Each user can only have one vote per poll
- Users can change their vote (upsert replaces the old vote)
- Database constraint prevents duplicate votes

---

## Testing

### Test Coverage

**Unit Tests** (`VenuePoll.test.ts`): 14 tests
- Vote count calculation
- Poll option structure
- Poll structure
- Vote uniqueness logic
- Realtime broadcast payload structure
- Channel naming conventions

**Integration Tests** (`VenuePoll.integration.test.ts`): 12 tests
- Realtime Broadcast channel format validation
- Broadcast payload structure
- Vote uniqueness constraint enforcement
- Live vote count update logic
- Poll data structure validation

**Total: 26 tests, all passing ✅**

### Running Tests

```bash
# Run all venue poll tests
npm test -- src/features/chat/VenuePoll

# Run unit tests only
npm test -- src/features/chat/VenuePoll.test.ts

# Run integration tests only
npm test -- src/features/chat/VenuePoll.integration.test.ts
```

---

## Database Schema

The implementation relies on the following database tables:

### `venue_polls`
```sql
CREATE TABLE venue_polls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `venue_poll_options`
```sql
CREATE TABLE venue_poll_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID NOT NULL REFERENCES venue_polls(id) ON DELETE CASCADE,
  venue_name   TEXT NOT NULL,
  price_est    NUMERIC(10,2),
  distance_km  DOUBLE PRECISION,
  votes        INT DEFAULT 0
);
```

### `venue_poll_votes`
```sql
CREATE TABLE venue_poll_votes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id   UUID NOT NULL REFERENCES venue_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES venue_poll_options(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE (poll_id, user_id)  -- Enforces one vote per user per poll
);
```

---

## User Experience

### Voting Flow

1. **User opens group chat** → VenuePoll component loads
2. **Poll appears** → Shows all venue options with current vote counts
3. **User clicks an option** → Vote is cast/changed
4. **Vote is saved** → Database updated via upsert
5. **Counts recalculated** → Fresh counts fetched from database
6. **Broadcast sent** → All group members receive update
7. **UI updates** → Vote counts and percentages update in real-time

### Visual Feedback

- **Loading state**: "Loading poll..." message
- **Error state**: Red error message with details
- **User's vote**: Blue border, checkmark, and "Your vote" label
- **Vote counts**: Badge showing number of votes per option
- **Percentages**: Visual progress bar and percentage text
- **Total votes**: Counter at the top of the poll
- **Closed poll**: Yellow warning message

---

## Performance Considerations

1. **Efficient Broadcasting**: Only vote counts are broadcast, not full poll data
2. **Optimistic Updates**: Local state updates immediately after voting
3. **Database Queries**: Vote counts are recalculated from source of truth
4. **Channel Cleanup**: Subscriptions are properly cleaned up on unmount
5. **Unique Channels**: Each group has its own channel to prevent cross-talk

---

## Future Enhancements

Potential improvements for future iterations:

1. **Optimistic UI Updates**: Update UI before database confirmation
2. **Vote Animations**: Animate vote count changes
3. **Poll Closing**: Allow captain to close polls
4. **Vote History**: Show who voted for what (if desired)
5. **Multiple Polls**: Support multiple active polls per group
6. **Poll Expiry**: Auto-close polls after a time period
7. **Notifications**: Notify users when a poll is created or closed

---

## Troubleshooting

### Common Issues

**Issue**: Vote counts not updating in real-time
- **Solution**: Check that Realtime is enabled in Supabase project settings
- **Solution**: Verify the channel name format: `group:{group_id}:poll`
- **Solution**: Check browser console for subscription status logs

**Issue**: User can vote multiple times
- **Solution**: Verify UNIQUE constraint exists on `venue_poll_votes(poll_id, user_id)`
- **Solution**: Check that upsert is using correct `onConflict` parameter

**Issue**: Votes not persisting
- **Solution**: Check RLS policies on `venue_poll_votes` table
- **Solution**: Verify user is authenticated and is a group member

---

## Conclusion

Task 16.2 is fully implemented with comprehensive test coverage. The venue poll system provides a smooth, real-time voting experience for group members to coordinate venue selection. All requirements (11.3 and 11.4) are met, and the implementation follows best practices for Supabase Realtime Broadcast.

**Implementation Date**: 2025
**Test Status**: ✅ All 26 tests passing
**Requirements Status**: ✅ Requirements 11.3 and 11.4 fully implemented
