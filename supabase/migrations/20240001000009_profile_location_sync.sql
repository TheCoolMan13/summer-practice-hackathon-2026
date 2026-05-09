-- Migration: Keep profiles.location (geography Point, SRID 4326) in sync with
-- profiles.location_lat / profiles.location_lng.
--
-- Requirements: 13.2, 13.3, 13.4
--
-- Why a trigger?
-- The application layer (ProfilePage.tsx) writes lat/lng as plain numeric
-- columns because the Supabase JS client cannot build PostGIS geography
-- values directly via PostgREST. A BEFORE INSERT/UPDATE trigger converts
-- those coordinates into the geography column so proximity queries
-- (ST_DWithin, etc.) continue to work everywhere, including when the user
-- updates their location from the frontend.
--
-- If the user later clears location sharing (sets lat/lng to NULL), the
-- trigger resets the geography column to NULL so the user is excluded
-- from proximity-based matching (Requirement 13.3).

-- ============================================================
-- Function: profiles_sync_location
-- Derives the geography Point from lat/lng on every INSERT/UPDATE.
-- Runs BEFORE the row is written so the stored value is always
-- consistent with the numeric columns.
-- ============================================================
CREATE OR REPLACE FUNCTION profiles_sync_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.location_lat IS NOT NULL AND NEW.location_lng IS NOT NULL THEN
    -- ST_MakePoint takes (longitude, latitude) — order matters.
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.location_lng, NEW.location_lat),
      4326
    )::geography;
  ELSE
    -- Clear the geography column when coordinates are not provided so
    -- the user is excluded from proximity matching.
    NEW.location := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Trigger: profiles_location_sync
-- Fires on every INSERT or UPDATE of the profiles table. We scope
-- to coordinate columns on UPDATE to avoid unnecessary work for
-- unrelated column changes.
-- ============================================================
DROP TRIGGER IF EXISTS profiles_location_sync ON profiles;

CREATE TRIGGER profiles_location_sync
  BEFORE INSERT OR UPDATE OF location_lat, location_lng
  ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_sync_location();

-- ============================================================
-- Backfill existing rows where lat/lng are populated but the
-- geography column is NULL (e.g. rows written before this
-- trigger existed). Safe no-op when there are no such rows.
-- ============================================================
UPDATE profiles
SET location_lat = location_lat  -- triggers the BEFORE UPDATE hook
WHERE location_lat IS NOT NULL
  AND location_lng IS NOT NULL
  AND location IS NULL;
