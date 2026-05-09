-- Quick Test Data Population Script
-- Run this in Supabase SQL Editor after registering your first user

-- Step 1: Check your user ID (run this first)
SELECT id, username, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
SELECT id, username, display_name FROM profiles ORDER BY created_at DESC LIMIT 5;

-- Step 2: Copy your user ID from above and replace 'YOUR_USER_ID_HERE' below

-- Step 3: Create test events
INSERT INTO events (
  sport, title, description, organizer_id,
  location_name, location_lat, location_lng,
  start_time, participant_limit, skill_requirement, status, source
) VALUES
  -- Football event (tomorrow)
  (
    'football',
    'Weekend Football Match',
    'Casual football game at Tempelhofer Feld. All skill levels welcome!',
    'YOUR_USER_ID_HERE',  -- ⚠️ REPLACE THIS
    'Tempelhofer Feld',
    52.4730, 13.4050,
    NOW() + INTERVAL '1 day',
    14,
    'intermediate',
    'open',
    'manual'
  ),
  -- Basketball event (today, 3 hours from now)
  (
    'basketball',
    '3v3 Basketball',
    'Quick pickup game at Mauerpark',
    'YOUR_USER_ID_HERE',  -- ⚠️ REPLACE THIS
    'Mauerpark Basketball Court',
    52.5420, 13.4050,
    NOW() + INTERVAL '3 hours',
    6,
    'beginner',
    'open',
    'manual'
  ),
  -- Tennis event (today, 2 hours from now)
  (
    'tennis',
    'Tennis Doubles',
    'Looking for 2 more players for doubles',
    'YOUR_USER_ID_HERE',  -- ⚠️ REPLACE THIS
    'Volkspark Friedrichshain',
    52.5280, 13.4290,
    NOW() + INTERVAL '2 hours',
    4,
    'intermediate',
    'open',
    'manual'
  ),
  -- Volleyball event (next week)
  (
    'volleyball',
    'Beach Volleyball',
    'Beach volleyball at Wannsee',
    'YOUR_USER_ID_HERE',  -- ⚠️ REPLACE THIS
    'Strandbad Wannsee',
    52.4320, 13.1790,
    NOW() + INTERVAL '7 days',
    12,
    'open',
    'manual'
  );

-- Step 4: Verify events were created
SELECT 
  sport,
  title,
  location_name,
  start_time,
  participant_limit,
  status
FROM events
ORDER BY start_time;
