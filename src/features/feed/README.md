# Feed Feature - Join Event Implementation

## Task 11.3: Implement "Join Event" action

### Requirements Implemented
- **Requirement 5.6**: Join event action on feed
- **Requirement 10.4**: Notify organizer when user joins
- **Requirement 10.5**: Handle full event rejection

### Files Created/Modified

#### 1. `useEventActions.ts`
Hook that provides event action functions, specifically `joinEvent()`.

**Key Features:**
- Checks if event is full before allowing join (participant_count >= participant_limit)
- Excludes cancelled participants from capacity check
- Prevents duplicate joins (checks if user is already a participant)
- Inserts into `event_participants` table with status='joined'
- Notifies organizer via `notifications` table
- Updates event status to 'full' when capacity is reached
- Requires authentication

**Error Handling:**
- Returns `{ success: false, isFull: true }` when event is full
- Returns `{ success: false, error: string }` for other errors
- Returns `{ success: true }` on successful join

#### 2. `FeedPage.tsx`
Complete feed UI with event discovery, filtering, and join functionality.

**Features:**
- Sport filter (Requirement 5.2)
- Distance filter (Requirement 5.3)
- Time window filter (Requirement 5.4)
- Empty state when no events match (Requirement 5.5)
- Join button with three states:
  - "Join Event" - clickable when space available
  - "Event is Full" - disabled when at capacity
  - "✓ Joined" - disabled when user already joined
- Success/error message display
- Auto-refetch after join to update UI

#### 3. `App.tsx`
Updated to import and use the new FeedPage component.

### Database Operations

**Join Flow:**
1. Fetch event with participants via PostgREST
2. Count active (non-cancelled) participants
3. Check if count < participant_limit
4. INSERT into `event_participants` (user_id, event_id, status='joined')
5. INSERT into `notifications` for organizer
6. UPDATE `events` set status='full' if at capacity

**RLS Policies:**
- `event_participants_insert_own`: Users can only insert their own participation
- `event_participants_select_auth`: Authenticated users can view participants
- `notifications` table allows inserts for any user_id (for organizer notifications)

### Testing

Manual testing steps:
1. Start the app and navigate to /feed
2. Verify events are displayed with participant counts
3. Click "Join Event" on an event with available capacity
4. Verify success message appears
5. Verify button changes to "✓ Joined"
6. Verify participant count increments
7. Try joining an event that's full - verify "Event is full" error
8. Check organizer's notifications table for join notification

### Edge Cases Handled

1. **Full Event**: Shows "Event is full" message, prevents join
2. **Already Joined**: Prevents duplicate joins, shows error message
3. **Cancelled Participants**: Excluded from capacity calculation
4. **Unauthenticated**: Returns error requiring login
5. **Event Not Found**: Returns error message
6. **Race Condition**: Unique constraint on (event_id, user_id) prevents duplicates
7. **Notification Failure**: Non-blocking - join succeeds even if notification fails

### Future Enhancements

- Real-time updates via Supabase Realtime subscriptions
- Leave event functionality
- Event detail page with full participant list
- Push notifications for organizers
