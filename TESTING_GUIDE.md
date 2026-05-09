# ShowUp2Move - Testing Guide

This guide will help you test the implemented features step by step.

## Prerequisites

1. ✅ Database migrations applied (you did this earlier)
2. ✅ Supabase credentials configured in `.env`
3. ✅ Dependencies installed (`npm install`)

## Step 1: Start the Development Server

```bash
npm run dev
```

The app should open at `http://localhost:5173`

## Step 2: Register Your First User

1. Navigate to `/register`
2. Create an account:
   - **Email**: `test@example.com`
   - **Username**: `testuser`
   - **Password**: `password123` (min 8 chars)
3. You'll be redirected to `/feed` after successful registration

## Step 3: Complete Your Profile

1. Navigate to `/profile`
2. Fill in your profile:
   - **Display Name**: Your name
   - **Bio**: Something about your sports interests
   - **Location City**: Berlin (or your city)
   - **Sports**: Add football, basketball, or tennis with skill levels
3. Click "Save Profile"

## Step 4: Populate the Database with Test Events

Since you're the first user, there won't be any events yet. Let's create some test data:

### Option A: Via Supabase Dashboard (Easiest)

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/hdmqkrkzxnqvchgccthl
2. Click on **SQL Editor**
3. Click **New Query**
4. Copy and paste this SQL (replace `YOUR_USER_ID` with your actual user ID):

```sql
-- Get your user ID first
SELECT id, username, display_name FROM profiles;

-- Then create test events (replace 'YOUR_USER_ID' with the ID from above)
INSERT INTO events (
  sport, title, description, organizer_id,
  location_name, location_lat, location_lng,
  start_time, participant_limit, skill_requirement, status, source
) VALUES
  -- Football event (2 days from now)
  (
    'football',
    'Weekend Football Match',
    'Casual football game at Tempelhofer Feld. All skill levels welcome!',
    'YOUR_USER_ID',
    'Tempelhofer Feld',
    52.4730, 13.4050,
    NOW() + INTERVAL '2 days',
    14,
    'intermediate',
    'open',
    'manual'
  ),
  -- Basketball event (tomorrow)
  (
    'basketball',
    '3v3 Basketball',
    'Quick pickup game at Mauerpark basketball court',
    'YOUR_USER_ID',
    'Mauerpark Basketball Court',
    52.5420, 13.4050,
    NOW() + INTERVAL '1 day',
    6,
    'beginner',
    'open',
    'manual'
  ),
  -- Tennis event (3 hours from now)
  (
    'tennis',
    'Tennis Doubles',
    'Looking for 2 more players for doubles match',
    'YOUR_USER_ID',
    'Volkspark Friedrichshain Tennis Courts',
    52.5280, 13.4290,
    NOW() + INTERVAL '3 hours',
    4,
    'intermediate',
    'open',
    'manual'
  ),
  -- Volleyball event (5 days from now)
  (
    'volleyball',
    'Beach Volleyball Session',
    'Beach volleyball at Wannsee. Bring sunscreen!',
    'YOUR_USER_ID',
    'Strandbad Wannsee',
    52.4320, 13.1790,
    NOW() + INTERVAL '5 days',
    12,
    'open',
    'manual'
  ),
  -- Event starting soon (2 hours from now)
  (
    'football',
    'Quick Football Game',
    'Last-minute football game, join if you can!',
    'YOUR_USER_ID',
    'Görlitzer Park',
    52.4960, 13.4380,
    NOW() + INTERVAL '2 hours',
    10,
    'open',
    'manual'
  );
```

5. Click **Run** to execute the query

### Option B: Quick Test with Minimal Data

If you just want to see the feed working, run this simpler query:

```sql
-- Get your user ID
SELECT id FROM profiles LIMIT 1;

-- Create one test event (replace the UUID below with your user ID)
INSERT INTO events (
  sport, title, organizer_id, location_name,
  location_lat, location_lng, start_time,
  participant_limit, status, source
)
SELECT
  'football',
  'Test Football Match',
  id,
  'Test Location',
  52.5200, 13.4050,
  NOW() + INTERVAL '1 day',
  10,
  'open',
  'manual'
FROM profiles
LIMIT 1;
```

## Step 5: Test the Feed

1. Go back to your app at `/feed`
2. You should now see the events you created!

### Test the Filters:

**Sport Filter:**
- Select "Football" - should show only football events
- Select "Basketball" - should show only basketball events
- Select "All Sports" - should show all events

**Time Window Filter:**
- Select "Next 24 hours" - should show only events starting within 24 hours
- Select "Next 2 days" - should show events within 2 days
- Select "Any Time" - should show all events

**Distance Filter:**
- Select "Within 10 km" - should filter by distance (if you set your location in profile)
- Note: Distance filtering requires you to have set location coordinates in your profile

### Test Joining Events:

1. Click "Join Event" on any event
2. You should see a success message: "Successfully joined the event!"
3. The button should change to "✓ Joined"
4. The participant count should increment

### Test Full Event:

1. Create an event with `participant_limit = 1`
2. Join it
3. Try to join again - should see "Event is full" error

## Step 6: Test Real-Time Updates

1. Open the app in two browser windows (or one normal + one incognito)
2. Login with the same account in both
3. In window 1: Join an event
4. In window 2: The event should update automatically (participant count increases)

## Step 7: Test the Matching Engine (Advanced)

To test the automatic matching:

1. **Register multiple users** (at least 10 for football)
2. **For each user:**
   - Complete their profile with location
   - Add sport preferences
   - Declare availability (you'll need to implement the availability UI first - task 6.1)
3. **Wait 5 minutes** for the matching engine to run
4. **Check the database** for created groups:

```sql
SELECT * FROM groups ORDER BY created_at DESC LIMIT 5;
SELECT * FROM group_members WHERE group_id = 'GROUP_ID_HERE';
```

## Troubleshooting

### No events showing up?

1. Check browser console for errors (F12)
2. Verify events exist in database:
   ```sql
   SELECT * FROM events WHERE status = 'open';
   ```
3. Check that events have `start_time` in the future

### Can't join events?

1. Make sure you're logged in
2. Check browser console for errors
3. Verify RLS policies are applied:
   ```sql
   SELECT * FROM event_participants WHERE user_id = 'YOUR_USER_ID';
   ```

### Filters not working?

1. **Sport filter**: Should work immediately
2. **Time filter**: Should work immediately
3. **Distance filter**: Requires you to set `location_lat` and `location_lng` in your profile

### Real-time updates not working?

1. Check browser console for Supabase Realtime connection errors
2. Verify your Supabase project has Realtime enabled
3. Try refreshing the page manually

## What to Test Next

Once the feed is working, you can test:

1. ✅ **Registration & Login** - Already working
2. ✅ **Profile Management** - Already working
3. ✅ **Event Feed** - Just tested!
4. ✅ **Join Events** - Just tested!
5. ⏳ **Availability Declaration** - Coming soon (task 6.1 UI)
6. ⏳ **Group Chat** - Coming soon (task 15.2-15.3)
7. ⏳ **Manual Event Creation** - Coming soon (task 12)

## Database Inspection Queries

Useful queries to check what's in your database:

```sql
-- View all events with participant counts
SELECT 
  e.sport,
  e.title,
  e.start_time,
  e.participant_limit,
  COUNT(ep.id) FILTER (WHERE ep.status != 'cancelled') as current_participants,
  e.status
FROM events e
LEFT JOIN event_participants ep ON e.id = ep.event_id
GROUP BY e.id
ORDER BY e.start_time;

-- View your profile
SELECT * FROM profiles WHERE username = 'testuser';

-- View events you've joined
SELECT 
  e.sport,
  e.title,
  e.start_time,
  ep.status
FROM event_participants ep
JOIN events e ON ep.event_id = e.id
WHERE ep.user_id = 'YOUR_USER_ID';

-- View all notifications
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;
```

## Next Steps

After testing the feed, you can:

1. **Commit your progress** to git
2. **Continue with more tasks** (manual event creation, group chat, etc.)
3. **Deploy to production** (optional)

Happy testing! 🎉
