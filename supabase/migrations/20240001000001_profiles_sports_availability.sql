-- Migration: profiles, user_sports, availability, availability_sports
-- Requirements: 3.1, 3.2, 6.1, 6.3

-- Enable PostGIS for proximity queries (Requirement 6.3, Location_Service)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- profiles
-- Stores user profile data including optional location fields.
-- id references auth.users so the profile is tied to the
-- Supabase Auth user record (cascades on user deletion).
-- location geography column enables ST_DWithin proximity queries.
-- ============================================================
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  bio           TEXT CHECK (char_length(bio) <= 280),
  avatar_url    TEXT,
  location_lat  DOUBLE PRECISION,
  location_lng  DOUBLE PRECISION,
  location_city TEXT,
  location      geography(Point, 4326),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- user_sports
-- Records which sports a user plays and at what skill level.
-- UNIQUE(user_id, sport) prevents duplicate sport entries per user.
-- ============================================================
CREATE TABLE user_sports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sport       TEXT NOT NULL,
  skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  UNIQUE (user_id, sport)
);

-- ============================================================
-- availability
-- One active availability record per user (UNIQUE on user_id).
-- expires_at is required and must be set to NOW() + 8 hours
-- by the application layer (Requirement 6.1).
-- ============================================================
CREATE TABLE availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_start TIMESTAMPTZ,
  preferred_end   TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ============================================================
-- availability_sports
-- Links an availability record to one or more sports the user
-- wants to play during that availability window (Requirement 6.3).
-- ============================================================
CREATE TABLE availability_sports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_id UUID NOT NULL REFERENCES availability(id) ON DELETE CASCADE,
  sport           TEXT NOT NULL
);
