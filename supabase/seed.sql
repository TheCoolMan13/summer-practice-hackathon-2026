-- Seed script for ShowUp2Move
-- Populates the database with test data for development and testing

-- ============================================================
-- 1. Create test users (profiles)
-- Note: You'll need to create these users via the Supabase Auth UI first,
-- or use the register endpoint. This script assumes auth.users already exist.
-- ============================================================

-- Insert test profiles (using placeholder UUIDs - replace with real auth.users IDs)
-- For testing, you should register these users via the app first, then update this script

-- Example test data structure (uncomment and update with real UUIDs after registration):

/*
INSERT INTO profiles (id, username, display_name, bio, location_lat, location_lng, location_city, location)
VALUES 
  ('USER_UUID_1', 'alex_football', 'Alex Johnson', 'Love playing football on weekends!', 52.5200, 13.4050, 'Berlin', ST_SetSRID(ST_MakePoint(13.4050, 52.5200), 4326)),
  ('USER_UUID_2', 'maria_tennis', 'Maria Garcia', 'Tennis enthusiast, intermediate level', 52.5210, 13.4060, 'Berlin', ST_SetSRID(ST_MakePoint(13.4060, 52.5210), 4326)),
  ('USER_UUID_3', 'john_basketball', 'John Smith', 'Basketball player, looking for pickup games', 52.5180, 13.4040, 'Berlin', ST_SetSRID(ST_MakePoint(13.4040, 52.5180), 4326));
*/

-- ============================================================
-- 2. Create sample events (manual events for testing the feed)
-- ============================================================

-- Football event
INSERT INTO events (
  sport,
  title,
  description,
  organizer_id,
  location_name,
  location_lat,
  location_lng,
  start_time,
  participant_limit,
  skill_requirement,
  price_per_person,
  status,
  source
)
SELECT
  'football',
  'Weekend Football Match',
  'Casual football game at Tempelhofer Feld. All skill levels welcome!',
  id,
  'Tempelhofer Feld',
  52.4730,
  13.4050,
  NOW() + INTERVAL '2 days',
  14,
  'intermediate',
  0,
  'open',
  'manual'
FROM profiles
LIMIT 1;

-- Basketball event
INSERT INTO events (
  sport,
  title,
  description,
  organizer_id,
  location_name,
  location_lat,
  location_lng,
  start_time,
  participant_limit,
  skill_requirement,
  status,
  source
)
SELECT
  'basketball',
  '3v3 Basketball',
  'Quick pickup game at Mauerpark basketball court',
  id,
  'Mauerpark Basketball Court',
  52.5420,
  13.4050,
  NOW() + INTERVAL '1 day',
  6,
  'beginner',
  'open',
  'manual'
FROM profiles
LIMIT 1;

-- Tennis event
INSERT INTO events (
  sport,
  title,
  description,
  organizer_id,
  location_name,
  location_lat,
  location_lng,
  start_time,
  participant_limit,
  skill_requirement,
  price_per_person,
  status,
  source
)
SELECT
  'tennis',
  'Tennis Doubles',
  'Looking for 2 more players for doubles match',
  id,
  'Volkspark Friedrichshain Tennis Courts',
  52.5280,
  13.4290,
  NOW() + INTERVAL '3 hours',
  4,
  'intermediate',
  5.00,
  'open',
  'manual'
FROM profiles
LIMIT 1;

-- Volleyball event
INSERT INTO events (
  sport,
  title,
  description,
  organizer_id,
  location_name,
  location_lat,
  location_lng,
  start_time,
  participant_limit,
  status,
  source
)
SELECT
  'volleyball',
  'Beach Volleyball Session',
  'Beach volleyball at Wannsee. Bring sunscreen!',
  id,
  'Strandbad Wannsee',
  52.4320,
  13.1790,
  NOW() + INTERVAL '5 days',
  12,
  'open',
  'manual'
FROM profiles
LIMIT 1;

-- Event starting soon (for time filter testing)
INSERT INTO events (
  sport,
  title,
  description,
  organizer_id,
  location_name,
  location_lat,
  location_lng,
  start_time,
  participant_limit,
  status,
  source
)
SELECT
  'football',
  'Quick Football Game',
  'Last-minute football game, join if you can!',
  id,
  'Görlitzer Park',
  52.4960,
  13.4380,
  NOW() + INTERVAL '2 hours',
  10,
  'open',
  'manual'
FROM profiles
LIMIT 1;

-- Event that's almost full (for testing full event handling)
INSERT INTO events (
  sport,
  title,
  description,
  organizer_id,
  location_name,
  location_lat,
  location_lng,
  start_time,
  participant_limit,
  status,
  source
)
SELECT
  'tennis',
  'Tennis Practice',
  'Tennis practice session',
  id,
  'Tiergarten Tennis Courts',
  52.5140,
  13.3500,
  NOW() + INTERVAL '1 day',
  2,
  'open',
  'manual'
FROM profiles
LIMIT 1;

-- ============================================================
-- 3. Add some participants to events (to test participant counts)
-- ============================================================

-- Add participants to the "almost full" tennis event
INSERT INTO event_participants (event_id, user_id, status)
SELECT 
  e.id,
  p.id,
  'joined'
FROM events e
CROSS JOIN profiles p
WHERE e.title = 'Tennis Practice'
LIMIT 1;

-- ============================================================
-- 4. Verification queries
-- ============================================================

-- Check created events
SELECT 
  sport,
  title,
  location_name,
  start_time,
  participant_limit,
  status,
  (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = events.id AND ep.status != 'cancelled') as current_participants
FROM events
ORDER BY start_time;

-- Check profiles
SELECT 
  username,
  display_name,
  location_city,
  location_lat,
  location_lng
FROM profiles;

-- Summary
SELECT 
  'Total Events' as metric,
  COUNT(*)::text as value
FROM events
UNION ALL
SELECT 
  'Total Profiles',
  COUNT(*)::text
FROM profiles
UNION ALL
SELECT 
  'Total Participants',
  COUNT(*)::text
FROM event_participants;
