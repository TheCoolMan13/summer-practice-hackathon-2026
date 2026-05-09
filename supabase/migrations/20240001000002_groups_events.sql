-- Migration: groups, group_members, captain_history, events, event_participants
-- Requirements: 7.1, 7.2, 8.1, 10.1, 10.5
--
-- NOTE: groups.event_id references events(id) and events.group_id references groups(id).
-- To break the circular dependency:
--   1. Create events WITHOUT the group_id FK
--   2. Create groups (which can reference events via event_id)
--   3. ALTER TABLE events to add the group_id FK

-- ============================================================
-- Step 1: events (without group_id FK — added later)
-- ============================================================
CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport             TEXT NOT NULL,
  title             TEXT,
  description       TEXT CHECK (char_length(description) <= 500),
  organizer_id      UUID NOT NULL REFERENCES profiles(id),
  group_id          UUID,  -- FK to groups added below after groups table is created
  location_name     TEXT,
  location_lat      DOUBLE PRECISION,
  location_lng      DOUBLE PRECISION,
  start_time        TIMESTAMPTZ NOT NULL,
  participant_limit INT NOT NULL,
  skill_requirement TEXT CHECK (skill_requirement IN ('beginner', 'intermediate', 'advanced')),
  price_per_person  NUMERIC(10,2),
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'full', 'confirmed', 'cancelled', 'completed')),
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'matched')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Step 2: groups (references events via event_id)
-- ============================================================
CREATE TABLE groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  captain_id   UUID REFERENCES profiles(id),
  min_size     INT NOT NULL,
  max_size     INT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  event_id     UUID REFERENCES events(id)
);

-- ============================================================
-- Step 3: Add group_id FK to events now that groups exists
-- ============================================================
ALTER TABLE events
  ADD CONSTRAINT events_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES groups(id);

-- ============================================================
-- Step 4: group_members
-- ============================================================
CREATE TABLE group_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed BOOLEAN DEFAULT FALSE,
  UNIQUE (group_id, user_id)
);

-- ============================================================
-- Step 5: captain_history
-- ============================================================
CREATE TABLE captain_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Step 6: event_participants
-- ============================================================
CREATE TABLE event_participants (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status   TEXT NOT NULL DEFAULT 'joined'
             CHECK (status IN ('joined', 'confirmed', 'cancelled')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);
