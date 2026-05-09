-- Migration: messages, notifications, venue_polls, venue_poll_options, venue_poll_votes, matching_queue
-- Requirements: 9.1, 11.3, 12.1, 15.1

-- ============================================================
-- messages
-- Stores chat messages for a group's dedicated chat room.
-- sender_id is nullable to support system-generated messages
-- (e.g., "Alex joined the group") — Requirement 9.3, 9.4.
-- reactions is a JSONB map of emoji → array of user_ids.
-- type CHECK restricts to 'user' or 'system' messages.
-- ============================================================
CREATE TABLE messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id  UUID        REFERENCES profiles(id),  -- NULL for system messages
  content    TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'user'
               CHECK (type IN ('user', 'system')),
  reactions  JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index to support efficient retrieval of the last N messages per group
-- (Requirement 9.6: return last 50 messages in chronological order).
CREATE INDEX messages_group_id_created_at_idx
  ON messages (group_id, created_at DESC);

-- ============================================================
-- notifications
-- Stores in-app notifications for individual users.
-- data is a JSONB payload carrying context-specific fields
-- (e.g., group_id, event_id) — Requirement 12.1.
-- read flag allows the client to mark notifications as seen.
-- ============================================================
CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       DEFAULT '{}',
  read       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index to support efficient per-user notification queries,
-- ordered by recency (Requirement 12.1).
CREATE INDEX notifications_user_id_created_at_idx
  ON notifications (user_id, created_at DESC);

-- ============================================================
-- venue_polls
-- Represents a venue poll created by a captain for a group.
-- status CHECK restricts to 'open' or 'closed' — Requirement 11.3.
-- created_by is NOT NULL because a poll always has an initiating captain.
-- ============================================================
CREATE TABLE venue_polls (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID        NOT NULL REFERENCES profiles(id),
  status     TEXT        NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- venue_poll_options
-- Each row is one venue option within a poll.
-- votes is a denormalised counter kept in sync by the application
-- layer / Edge Function when a vote is cast or retracted.
-- price_est and distance_km are optional AI-provided estimates
-- (Requirement 11.1).
-- ============================================================
CREATE TABLE venue_poll_options (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID           NOT NULL REFERENCES venue_polls(id) ON DELETE CASCADE,
  venue_name  TEXT           NOT NULL,
  price_est   NUMERIC(10,2),
  distance_km DOUBLE PRECISION,
  votes       INT            DEFAULT 0
);

-- ============================================================
-- venue_poll_votes
-- Records each user's single vote in a poll.
-- UNIQUE(poll_id, user_id) enforces the one-vote-per-user-per-poll
-- invariant at the database level (Requirement 11.3, Property 7).
-- Cascades on poll or option deletion keep the table clean.
-- ============================================================
CREATE TABLE venue_poll_votes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id   UUID NOT NULL REFERENCES venue_polls(id)        ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES venue_poll_options(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES profiles(id)           ON DELETE CASCADE,
  UNIQUE (poll_id, user_id)
);

-- ============================================================
-- matching_queue
-- Holds users waiting to be matched for a specific sport.
-- UNIQUE(user_id, sport) prevents a user from being queued
-- twice for the same sport simultaneously (Requirement 7.6).
-- Records are removed by the expire-availability Edge Function
-- when a user's availability expires (Requirement 16.5).
-- ============================================================
CREATE TABLE matching_queue (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sport     TEXT        NOT NULL,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, sport)
);

-- Index to support efficient sport-based queue lookups by the
-- matching engine (Requirement 7.1).
CREATE INDEX matching_queue_sport_queued_at_idx
  ON matching_queue (sport, queued_at ASC);
