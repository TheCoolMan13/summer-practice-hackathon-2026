-- Migration: allow users to INSERT their own profile row.
-- Fixes: 403 on POST /rest/v1/profiles when a newly registered user
--        upserts their profile for the first time (no row exists yet,
--        so upsert resolves to INSERT, which had no matching policy).
--
-- profiles already has:
--   profiles_select_all   (SELECT, USING (true))
--   profiles_update_own   (UPDATE, USING (auth.uid() = id))
--
-- We add INSERT here and also harden the UPDATE with WITH CHECK so a
-- user cannot UPDATE their row and change id to someone else's.

-- Idempotent: drop if re-running.
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Tighten existing UPDATE policy with WITH CHECK.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
