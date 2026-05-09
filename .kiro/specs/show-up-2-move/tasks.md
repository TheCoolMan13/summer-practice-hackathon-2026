# Implementation Plan: ShowUp2Move

## Overview

This plan converts the ShowUp2Move design into incremental coding tasks. The stack is React (frontend), Supabase (Auth, PostgREST, Realtime, Storage, Edge Functions, pg_cron), PostgreSQL + PostGIS, TypeScript (Deno for Edge Functions, Vitest + fast-check for tests), and an optional Python FastAPI AI microservice. Tasks are ordered so each step builds on the previous one, ending with full integration.

---

## Tasks

- [x] 1. Project scaffold and Supabase local environment
  - Initialise the React app (Vite + TypeScript) and the Supabase project (`supabase init`)
  - Add `@supabase/supabase-js`, `leaflet`, `react-leaflet`, and `fast-check` + `vitest` as dependencies
  - Create `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` placeholders
  - Create `src/lib/supabaseClient.ts` that exports the typed Supabase client
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2. Database schema — core tables and RLS
  - [x] 2.1 Write migration: `profiles`, `user_sports`, `availability`, `availability_sports`
    - Create all four tables with constraints and foreign keys exactly as specified in the design
    - Enable PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis`)
    - Add `location` geography column to `profiles` for PostGIS proximity queries
    - _Requirements: 3.1, 3.2, 6.1, 6.3_
  - [x] 2.2 Write migration: `groups`, `group_members`, `captain_history`, `events`, `event_participants`
    - Create all five tables with constraints, foreign keys, and CHECK constraints
    - _Requirements: 7.1, 7.2, 8.1, 10.1, 10.5_
  - [x] 2.3 Write migration: `messages`, `notifications`, `venue_polls`, `venue_poll_options`, `venue_poll_votes`, `matching_queue`
    - Create all six tables with constraints and foreign keys
    - _Requirements: 9.1, 11.3, 12.1, 15.1_
  - [x] 2.4 Write migration: all RLS policies
    - Apply every RLS policy from the design document to `profiles`, `availability`, `groups`, `messages`, `notifications`, `events`, `event_participants`, `group_members`, `venue_polls`, `venue_poll_votes`, `matching_queue`
    - _Requirements: 1.3, 9.2, 12.3_
  - [ ]* 2.5 Write property test for profile data round-trip (Property 12)
    - **Property 12: Profile data round-trip**
    - Use `fc.record({ displayName: fc.string({minLength:1, maxLength:100}), sports: fc.array(fc.string(), {minLength:1}) })` to generate arbitrary valid profiles
    - Assert that saving then retrieving a profile returns all submitted fields unchanged
    - Assert that a subsequent AI suggestion call (mocked) does not alter manually set sports without confirmation
    - **Validates: Requirements 3.1, 3.4**

- [x] 3. Supabase Storage — avatar bucket
  - Create the `avatars` storage bucket via migration or Supabase dashboard config
  - Add storage policy: authenticated users may only upload to `avatars/{user_id}/*`; public read allowed
  - Create `src/lib/storage.ts` with `uploadAvatar(userId, file)` and `getAvatarUrl(userId)` helpers
  - _Requirements: 3.5_

- [x] 4. Authentication — registration and login
  - [x] 4.1 Implement registration flow
    - Create `src/features/auth/RegisterPage.tsx` with email, username, and password fields (min 8 chars)
    - Call `supabase.auth.signUp()` and on success upsert a row into `profiles`
    - Display "Email already in use" on 422 and generic error with retry on 5xx
    - _Requirements: 1.1, 1.2, 1.5_
  - [x] 4.2 Implement login flow
    - Create `src/features/auth/LoginPage.tsx` calling `supabase.auth.signInWithPassword()`
    - On 400 show "Email or password is incorrect" without field disambiguation
    - On 401 redirect to login with descriptive message; implement `AuthGuard` HOC that wraps protected routes
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 4.3 Write property test for password security invariant (Property 4)
    - **Property 4: Password security invariant**
    - Use `fc.string({minLength:8})` to generate arbitrary passwords
    - Assert that no Supabase Auth API response body contains the plaintext password or a bcrypt hash
    - Assert that the value stored in `auth.users` is a valid bcrypt hash (cost ≥ 10), not plaintext
    - **Validates: Requirements 1.3, 1.4**

- [x] 5. User profile — creation and editing
  - [x] 5.1 Implement profile creation and edit page
    - Create `src/features/profile/ProfilePage.tsx` with display name, bio (max 280 chars), sport preferences with skill levels, and location fields
    - Wire to PostgREST `profiles` and `user_sports` tables via Supabase client
    - Implement avatar upload using the `uploadAvatar` helper from task 3
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  - [x] 5.2 Implement AI-assisted sport suggestion
    - Create `src/features/profile/SportSuggestions.tsx` that calls the `ai-proxy` Edge Function with the user's bio text
    - Display returned sport suggestions as selectable chips; require explicit confirmation before writing to `user_sports`
    - Show "AI suggestions temporarily unavailable" non-blocking message when the Edge Function returns a degraded response
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Availability declaration — "ShowUpToday?"
  - [x] 6.1 Implement availability upsert UI and API call
    - Create `src/features/availability/AvailabilityPrompt.tsx` with Yes/No toggle, optional time window picker, and sport multi-select
    - On "Yes" upsert into `availability` with `expires_at = NOW() + interval '8 hours'`; on "No" set `is_available = false`
    - Display current status and remaining time when an active declaration exists
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_
  - [ ]* 6.2 Write property test for availability expiry invariant (Property 1)
    - **Property 1: Availability expiry invariant**
    - Use `fc.date()` to generate arbitrary creation timestamps
    - Assert that `expires_at` always equals `created_at + 8 hours` for any new availability record
    - Use `fc.date({max: pastDate})` to generate already-expired records and assert they do not appear in matching engine candidate queries
    - **Validates: Requirements 6.1, 6.4, 16.5**

- [x] 7. Edge Function: `expire-availability`
  - Create `supabase/functions/expire-availability/index.ts`
  - Query `availability` for records where `expires_at <= NOW()` and `is_available = true`; set `is_available = false`
  - Delete corresponding rows from `matching_queue`
  - Insert a notification for each affected user: "Your availability has expired"
  - Register pg_cron schedule: every 1 minute
  - _Requirements: 6.4, 16.5_

- [x] 8. Edge Function: `match-users` — core matching engine
  - [x] 8.1 Implement candidate selection and grouping logic
    - Create `supabase/functions/match-users/index.ts`
    - Query active available users grouped by sport; apply `ST_DWithin(10km)` proximity filter using PostGIS
    - Apply skill-level compatibility filter (within one tier)
    - Group candidates into groups satisfying `SPORT_SIZES[sport].min ≤ size ≤ SPORT_SIZES[sport].max`
    - Users below `min_size` threshold go into `matching_queue`; insert "Matching in progress" notification for queued users
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_
  - [x] 8.2 Implement AI compatibility scoring integration
    - Call the AI microservice `POST /profile-compatibility` for candidate pairs when AI is available
    - Use scores as a secondary ranking signal; fall back gracefully (proceed without scores) when AI is unavailable
    - _Requirements: 7.5, 14.3_
  - [x] 8.3 Implement group creation, event creation, and notification dispatch
    - INSERT into `groups`, `group_members`, `events` (source='matched'), and `notifications` for all members
    - INSERT system message "Group created" into `messages`
    - Trigger captain selection (see task 9)
    - Complete all inserts within a single database transaction; target ≤ 5 seconds total
    - _Requirements: 7.8, 8.1, 9.1, 9.3, 12.1_
  - [x] 8.4 Register pg_cron schedule for `match-users`
    - Schedule `match-users` to run every 5 minutes via pg_cron
    - _Requirements: 7.1_
  - [ ]* 8.5 Write property test for matching group size bounds (Property 2)
    - **Property 2: Matching group size bounds and completeness**
    - Use `fc.array(fc.record({ sport: fc.constantFrom('football','basketball','tennis','volleyball'), skill: fc.constantFrom('beginner','intermediate','advanced'), lat: fc.double({min:-90,max:90}), lng: fc.double({min:-180,max:180}) }), {minLength:0, maxLength:30})` to generate arbitrary candidate pools
    - Assert every created group satisfies `min_size(sport) ≤ members ≤ max_size(sport)`
    - Assert that when candidate count < `min_size(sport)`, no group is created and all candidates are in the pending queue
    - **Validates: Requirements 7.1, 7.2, 7.6**

- [x] 9. Edge Function: captain selection logic
  - [x] 9.1 Implement weighted random captain selection
    - Extract captain selection into `supabase/functions/match-users/captainSelector.ts`
    - Query `captain_history` for each candidate; reduce selection weight for users appearing in their last 3 entries
    - INSERT into `captain_history` and UPDATE `groups.captain_id`
    - INSERT "You are the captain" notification for the assigned captain
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 9.2 Write property test for captain selection invariant (Property 3)
    - **Property 3: Captain selection invariant**
    - Use `fc.array(fc.uuid(), {minLength:2, maxLength:14})` for group members and `fc.array(fc.uuid())` for captain history entries
    - Assert exactly one captain is assigned per group
    - Assert the captain is always a current group member
    - Assert users in the last 3 captain_history entries have strictly lower selection probability than users with no recent history
    - **Validates: Requirements 8.1, 8.2**

- [x] 10. Edge Function: `reassign-captain`
  - Create `supabase/functions/reassign-captain/index.ts`
  - Query groups where `status='pending'` and captain has `confirmed=false` and `created_at < NOW() - interval '2 hours'`
  - Select eligible replacement (not in last 3 `captain_history` entries for that user)
  - UPDATE `groups.captain_id`, INSERT `captain_history`, INSERT notifications for all group members, INSERT system message "New captain assigned"
  - Register pg_cron schedule: every 15 minutes
  - _Requirements: 8.4, 16.4_

- [x] 11. Home feed — event discovery and filtering
  - [x] 11.1 Implement feed data layer and PostgREST queries
    - Create `src/features/feed/useFeed.ts` hook that queries the `events` table with PostgREST filters
    - Support sport filter, distance filter (PostGIS `ST_DWithin`), and time window filter applied simultaneously
    - Return events sorted by `start_time ASC`; include participant count, group size, organizer display name, and user participation status
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 11.2 Implement feed UI with Realtime subscription
    - Create `src/features/feed/FeedPage.tsx` with filter controls and event cards
    - Subscribe to `feed` Realtime channel (DB Changes on `events`) to receive live updates
    - Display empty state message when no events match filters
    - _Requirements: 5.1, 5.5_
  - [x] 11.3 Implement "Join Event" action
    - On "Join" tap, INSERT into `event_participants`; handle full-event rejection (participant_limit reached) by showing "Event is full"
    - Notify organizer via notification INSERT
    - _Requirements: 5.6, 10.4, 10.5_
  - [ ]* 11.4 Write property test for feed filter correctness (Property 5)
    - **Property 5: Feed filter correctness**
    - Use `fc.record({ sport: fc.constantFrom('football','basketball','tennis','volleyball'), lat: fc.double({min:-90,max:90}), lng: fc.double({min:-180,max:180}), radiusKm: fc.integer({min:1,max:100}), timeWindowHours: fc.integer({min:1,max:168}) })` plus a random event set
    - Assert every returned event satisfies all active filter conditions simultaneously
    - **Validates: Requirements 5.2, 5.3, 5.4**
  - [ ]* 11.5 Write property test for event participant limit invariant (Property 8)
    - **Property 8: Event participant limit invariant**
    - Use `fc.integer({min:1, max:50})` for participant_limit and `fc.integer({min:0, max:60})` for join attempt count
    - Assert active participant count never exceeds `participant_limit`
    - Assert join attempts when count equals limit are rejected and event is marked full
    - **Validates: Requirements 10.5**

- [x] 12. Manual event creation
  - Create `src/features/events/CreateEventPage.tsx` with required fields (sport, location, start_time, participant_limit) and optional fields (skill_requirement, price_per_person, description ≤ 500 chars)
  - INSERT into `events` with `organizer_id = auth.uid()` and `source='manual'`
  - Display event location on embedded Leaflet map
  - _Requirements: 10.1, 10.2, 10.3, 11.6_

- [x] 13. Event detail page and map view
  - Create `src/features/events/EventDetailPage.tsx` showing all event fields, participant list, and embedded Leaflet map
  - Subscribe to `feed` Realtime channel for live participant count updates
  - Implement cancel participation: UPDATE `event_participants.status = 'cancelled'` and refresh count
  - _Requirements: 10.6, 11.6, 13.1_

- [x] 14. Checkpoint — core data layer and auth complete
  - Ensure all migrations run cleanly against local Supabase (`supabase db reset`)
  - Ensure all tests written so far pass (`vitest --run`)
  - Ask the user if questions arise before proceeding to real-time and chat features.

- [x] 15. Group chat — real-time messaging
  - [x] 15.1 Implement chat message persistence and retrieval
    - Create `src/features/chat/useGroupChat.ts` hook that fetches the last 50 messages from `messages` ordered by `created_at ASC`
    - INSERT new messages with `sender_id = auth.uid()` and `type='user'`
    - _Requirements: 9.2, 9.6, 9.7_
  - [x] 15.2 Implement Realtime chat subscription
    - Subscribe to `group:{group_id}:messages` channel (Postgres Changes on `messages`)
    - Append incoming messages to local state; on reconnect re-fetch last 50 messages
    - _Requirements: 9.2, 9.6_
  - [x] 15.3 Implement chat UI with reactions
    - Create `src/features/chat/ChatRoom.tsx` with message list, input box, and emoji reaction bar (👍 ❤️ 😂 🔥 👏)
    - Reactions stored as JSONB in `messages.reactions`; UPDATE via PostgREST
    - Display system messages (join/leave/confirm) in a visually distinct style
    - Display empty state when no messages exist
    - _Requirements: 9.3, 9.4, 9.5, 9.7_
  - [ ]* 15.4 Write property test for message sender membership invariant (Property 6)
    - **Property 6: Message sender membership invariant**
    - Use `fc.uuid()` for sender and group combinations; test both member and non-member senders
    - Assert that INSERT attempts by non-members are rejected with a permission error (RLS violation)
    - Assert that all successfully inserted messages have a sender who is a current group member
    - **Validates: Requirements 9.2**

- [x] 16. Venue polling and coordination
  - [x] 16.1 Implement venue poll creation and voting
    - Create `src/features/groups/VenuePoll.tsx` that INSERTs into `venue_polls` and `venue_poll_options`
    - Implement vote action: INSERT into `venue_poll_votes` (UNIQUE constraint enforces one vote per user per poll)
    - _Requirements: 11.3, 11.4_
  - [x] 16.2 Implement live vote count updates via Realtime
    - Subscribe to `group:{group_id}:poll` Broadcast channel for live vote count updates
    - Display live vote counts to all group members
    - _Requirements: 11.4_
  - [ ]* 16.3 Write property test for venue poll vote uniqueness (Property 7)
    - **Property 7: Venue poll vote uniqueness**
    - Use `fc.array(fc.record({ userId: fc.uuid(), optionId: fc.uuid() }))` with potential duplicate userId entries
    - Assert each user has at most one vote recorded across all options in a poll
    - Assert a second vote from the same user either replaces the previous vote or is rejected
    - **Validates: Requirements 11.3, 11.4**

- [x] 17. Edge Function: `venue-suggestions` and `ai-proxy`
  - Create `supabase/functions/venue-suggestions/index.ts`: call AI `POST /venue-recommendations` with sport, participant count, and location; return up to 5 venues or empty list on failure
  - Create `supabase/functions/ai-proxy/index.ts`: proxy AI requests with 3-second timeout; return degraded response `{ sports: [], error: "service unavailable" }` on failure
  - Implement AI health check: mark AI unavailable when `/health` returns non-200 or times out; auto-resume on recovery
  - _Requirements: 11.1, 11.2, 14.1, 14.2, 14.4_

- [x] 18. Captain coordination actions
  - Add captain-only UI controls to `ChatRoom.tsx`: confirm event button, propose venue options (calls `venue-suggestions`), finalize time and location
  - On event confirm: UPDATE `events.status = 'confirmed'`, INSERT system message "Sport match confirmed", INSERT notifications for all group members
  - On venue finalize: INSERT notification with confirmed location and start time for all group members
  - _Requirements: 8.5, 9.4, 11.5, 12.2, 12.6_

- [x] 19. Notifications — real-time delivery and inbox
  - [x] 19.1 Implement notification Realtime subscription
    - Create `src/features/notifications/useNotifications.ts` hook subscribing to `user:{user_id}:notifications` channel (DB Changes on `notifications`)
    - Fetch unread notifications on mount; mark as read via UPDATE
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6_
  - [x] 19.2 Implement notification bell UI
    - Create `src/features/notifications/NotificationBell.tsx` with unread badge count and dropdown inbox
    - Show non-blocking "AI suggestions temporarily unavailable" toast when AI features are degraded
    - _Requirements: 12.1, 14.5_

- [x] 20. Edge Function: `send-reminders`
  - Create `supabase/functions/send-reminders/index.ts`
  - Query events where `start_time BETWEEN NOW() AND NOW() + interval '1 hour'` and status IN ('confirmed','open')
  - INSERT reminder notifications for all active participants
  - Register pg_cron schedule: every hour
  - _Requirements: 12.5_

- [x] 21. Edge Function: `reengage-users` and re-engagement notifications
  - [x] 21.1 Implement re-engagement detection and notification dispatch
    - Create `supabase/functions/reengage-users/index.ts`
    - Query users with no availability record in the last 5 days
    - Check last re-engagement notification timestamp; skip if sent within 48 hours
    - Call AI `POST /generate-message` with user sport preferences and activity history; fall back to generic message on AI failure
    - INSERT notification; record timestamp to enforce 48-hour rate limit
    - Register pg_cron schedule: daily
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [x] 21.2 Implement 7-day suppression after availability declaration
    - In the availability upsert flow (task 6.1), after a successful "Yes" declaration, check if a re-engagement notification was sent in the last 7 days and set a suppression flag
    - The `reengage-users` function must respect this suppression flag before sending
    - _Requirements: 15.5_
  - [ ]* 21.3 Write property test for re-engagement notification rate limiting (Property 9)
    - **Property 9: Re-engagement notification rate limiting**
    - Use `fc.array(fc.date(), {minLength:1, maxLength:20})` for activity timestamp sequences
    - Assert at most one re-engagement reminder is sent within any rolling 48-hour window per user
    - Assert no re-engagement reminder is sent within 7 days after a user declares availability
    - **Validates: Requirements 15.4, 15.5**

- [ ] 22. Group membership lifecycle — leave and re-queue
  - [x] 22.1 Implement leave group action
    - Add "Leave Group" button to group view; DELETE from `group_members`
    - INSERT system message "User left the group"
    - Re-evaluate group size: if `remaining < min_size(sport)`, INSERT notifications for all remaining members offering re-queue or cancel options
    - _Requirements: 16.2, 16.3_
  - [ ]* 22.2 Write property test for group membership change consistency (Property 11)
    - **Property 11: Group membership change consistency**
    - Use `fc.integer({min:2, max:20})` for initial group size and `fc.constantFrom('football','basketball','tennis','volleyball')` for sport
    - Assert that after one member leaves, active member count equals N − 1
    - Assert a system message is posted in the group chat
    - Assert that if N − 1 < `min_size(sport)`, all remaining members receive a notification
    - **Validates: Requirements 16.2, 16.3**

- [ ] 23. AI degradation — end-to-end resilience wiring
  - [x] 23.1 Implement AI health state management
    - Create `src/lib/aiHealth.ts` that polls the `ai-proxy` Edge Function's health status and exposes a React context `AIHealthContext`
    - All AI-dependent components consume `AIHealthContext` to conditionally show degraded-mode UI
    - _Requirements: 14.2, 14.4, 14.5_
  - [ ]* 23.2 Write property test for AI degradation invariant (Property 10)
    - **Property 10: AI degradation does not block core operations**
    - Use `fc.boolean()` for AI availability flag and `fc.constantFrom('profile','availability','matching','chat','event','notification')` for operation types
    - Assert that for every core operation type, the operation completes successfully regardless of AI availability flag
    - Assert that when AI is unavailable, the response is a valid non-error response (degraded suggestions, not an error)
    - **Validates: Requirements 14.3, 4.2, 7.5, 11.2**

- [x] 24. Location services — profile location and proximity
  - Implement location permission request in `ProfilePage.tsx` with privacy notice before requesting browser geolocation
  - Store coordinates in `profiles.location_lat` / `profiles.location_lng` and update the PostGIS `location` geography column
  - Allow manual city/area entry as fallback when location sharing is disabled
  - _Requirements: 13.2, 13.3, 13.4_

- [x] 25. Error handling and resilience — frontend layer
  - Implement global error boundary in `src/App.tsx` that catches unexpected errors and shows a descriptive message with a retry button
  - Handle Supabase 401 (redirect to login), 403 (show "You don't have permission"), and 5xx (show error with retry) uniformly via an Axios/fetch interceptor or Supabase client error handler
  - Show "Reconnecting..." indicator when Realtime connection drops
  - _Requirements: 16.7, 2.3, 2.4_

- [~] 26. Checkpoint — full integration and all tests passing
  - Run `supabase db reset` and verify all migrations apply cleanly
  - Run `vitest --run` and confirm all unit and property tests pass
  - Manually verify the end-to-end flow: register → profile → declare availability → matching → group chat → event confirm → notification
  - Ask the user if questions arise before final review.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 14 and 26) ensure incremental validation at natural breaks
- Property tests use fast-check with a minimum of 100 iterations per property
- All Edge Functions are written in TypeScript (Deno runtime)
- The AI microservice is optional; every feature degrades gracefully when it is unavailable
- pg_cron schedules are registered as part of the Edge Function deployment step

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 1, "tasks": ["2.4"] },
    { "id": 2, "tasks": ["2.5", "4.1", "4.2"] },
    { "id": 3, "tasks": ["4.3", "5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "6.2", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "9.1", "11.1"] },
    { "id": 6, "tasks": ["8.4", "8.5", "9.2", "11.2", "11.3", "15.1"] },
    { "id": 7, "tasks": ["11.4", "11.5", "15.2", "15.3", "16.1", "19.1", "21.1"] },
    { "id": 8, "tasks": ["15.4", "16.2", "16.3", "19.2", "21.2", "22.1", "23.1"] },
    { "id": 9, "tasks": ["21.3", "22.2", "23.2"] }
  ]
}
```
