-- Migration: Row-Level Security policies for all tables
-- Requirements: 1.3, 9.2, 12.3

-- ============================================================
-- profiles
-- All users can read any profile (public discovery).
-- Users can only update their own profile.
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- user_sports
-- All authenticated users can read sport preferences (needed
-- for profile display and matching).
-- Users can only insert/update/delete their own sport entries.
-- ============================================================
ALTER TABLE user_sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sports_select_all"
  ON user_sports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "user_sports_insert_own"
  ON user_sports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sports_update_own"
  ON user_sports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "user_sports_delete_own"
  ON user_sports FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- availability
-- Users manage only their own availability record.
-- ============================================================
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avail_select_own"
  ON availability FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "avail_insert_own"
  ON availability FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "avail_update_own"
  ON availability FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- availability_sports
-- Users can read/insert/delete sports linked to their own
-- availability records (joined via availability.user_id).
-- ============================================================
ALTER TABLE availability_sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avail_sports_select_own"
  ON availability_sports FOR SELECT
  USING (
    availability_id IN (
      SELECT id FROM availability WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "avail_sports_insert_own"
  ON availability_sports FOR INSERT
  WITH CHECK (
    availability_id IN (
      SELECT id FROM availability WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "avail_sports_delete_own"
  ON availability_sports FOR DELETE
  USING (
    availability_id IN (
      SELECT id FROM availability WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- groups
-- Members can read groups they belong to.
-- Insert/update is handled by Edge Functions (service role),
-- so no client-facing insert/update policy is needed here.
-- ============================================================
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select_member"
  ON groups FOR SELECT
  USING (
    id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- group_members
-- Members can read membership rows for groups they belong to.
-- Insert is controlled by the matching Edge Function (service
-- role), so no client INSERT policy is defined.
-- ============================================================
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select_own"
  ON group_members FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- captain_history
-- All authenticated users can read captain history.
-- This is required by the captain selection logic in Edge
-- Functions and for transparency in the UI.
-- ============================================================
ALTER TABLE captain_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "captain_history_select_auth"
  ON captain_history FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- events
-- All authenticated users can read open events (feed).
-- Only the organizer can insert their own events.
-- Organizer or group captain can update the event.
-- ============================================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_auth"
  ON events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "events_insert_own"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "events_update_own"
  ON events FOR UPDATE
  USING (
    auth.uid() = organizer_id
    OR auth.uid() IN (
      SELECT captain_id FROM groups WHERE id = group_id
    )
  );

-- ============================================================
-- event_participants
-- All authenticated users can read participants (needed for
-- event detail pages and participant counts).
-- Users can insert/update only their own participation record.
-- ============================================================
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_participants_select_auth"
  ON event_participants FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "event_participants_insert_own"
  ON event_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_participants_update_own"
  ON event_participants FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- messages
-- Group members can read messages in their groups.
-- Group members can insert messages; sender_id must match
-- auth.uid() or be NULL (system messages from Edge Functions).
-- ============================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_member"
  ON messages FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert_member"
  ON messages FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    AND (sender_id = auth.uid() OR sender_id IS NULL)
  );

-- ============================================================
-- notifications
-- Users can only read and update (mark as read) their own
-- notifications.
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notif_update_own"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- venue_polls
-- Group members can read polls for their groups.
-- Only the group captain can create a poll.
-- ============================================================
ALTER TABLE venue_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_polls_select_member"
  ON venue_polls FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "venue_polls_insert_captain"
  ON venue_polls FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND group_id IN (
      SELECT id FROM groups WHERE captain_id = auth.uid()
    )
  );

-- ============================================================
-- venue_poll_options
-- Group members can read options for polls in their groups.
-- Only the group captain (poll creator) can insert options.
-- ============================================================
ALTER TABLE venue_poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_poll_options_select_member"
  ON venue_poll_options FOR SELECT
  USING (
    poll_id IN (
      SELECT vp.id FROM venue_polls vp
      JOIN group_members gm ON gm.group_id = vp.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "venue_poll_options_insert_captain"
  ON venue_poll_options FOR INSERT
  WITH CHECK (
    poll_id IN (
      SELECT vp.id FROM venue_polls vp
      JOIN groups g ON g.id = vp.group_id
      WHERE g.captain_id = auth.uid()
    )
  );

-- ============================================================
-- venue_poll_votes
-- Group members can read all votes for polls in their groups.
-- Authenticated group members can insert their own vote.
-- The UNIQUE(poll_id, user_id) constraint on the table enforces
-- the one-vote-per-user-per-poll invariant (Property 7).
-- ============================================================
ALTER TABLE venue_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_poll_votes_select_member"
  ON venue_poll_votes FOR SELECT
  USING (
    poll_id IN (
      SELECT vp.id FROM venue_polls vp
      JOIN group_members gm ON gm.group_id = vp.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "venue_poll_votes_insert_own"
  ON venue_poll_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND poll_id IN (
      SELECT vp.id FROM venue_polls vp
      JOIN group_members gm ON gm.group_id = vp.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

-- ============================================================
-- matching_queue
-- Users can read and manage only their own queue entries.
-- ============================================================
ALTER TABLE matching_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matching_queue_select_own"
  ON matching_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "matching_queue_insert_own"
  ON matching_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "matching_queue_update_own"
  ON matching_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "matching_queue_delete_own"
  ON matching_queue FOR DELETE
  USING (auth.uid() = user_id);
