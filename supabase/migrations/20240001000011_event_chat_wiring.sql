-- Migration: wire per-event chat + fix recursive RLS on group_members
--
-- Feature: show-up-2-move — per-event group chat
-- Requirements: 9.1, 9.2, 10.4
--
-- This migration does three things:
--
--   1. Fixes the recursive RLS policy on `group_members`. The original
--      `group_members_select_own` policy referenced `group_members` inside
--      its own USING clause, which made PostgREST return HTTP 500 for any
--      client query against that table. It is replaced with a
--      SECURITY DEFINER helper that bypasses RLS for the membership check.
--
--   2. Adds a BEFORE INSERT trigger on `events` that creates a companion
--      `groups` row for every new event and sets `events.group_id`
--      automatically. The event organizer is captain by default.
--
--   3. Adds an AFTER INSERT/UPDATE trigger on `event_participants` that
--      mirrors active participants into `group_members` (and removes them
--      when they cancel). Joining an event therefore grants access to
--      that event's group chat without any extra round-trip from the
--      frontend.
--
--   4. Backfills groups + memberships for events that were created before
--      this migration, so existing data works end-to-end.

-- ============================================================
-- 1. Fix the recursive RLS on group_members
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

-- Anyone authenticated may call the helper; it never exposes row data,
-- only a boolean.
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "group_members_select_own" ON public.group_members;

CREATE POLICY "group_members_select_same_group"
  ON public.group_members FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

-- ============================================================
-- 2. Every event gets its own group (BEFORE INSERT trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_event_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_min_size int;
  v_max_size int;
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_max_size := GREATEST(NEW.participant_limit, 2);
  v_min_size := LEAST(2, v_max_size);

  INSERT INTO public.groups (sport, status, captain_id, min_size, max_size, event_id)
  VALUES (NEW.sport, 'pending', NEW.organizer_id, v_min_size, v_max_size, NEW.id)
  RETURNING id INTO v_group_id;

  NEW.group_id := v_group_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_create_group ON public.events;
CREATE TRIGGER events_create_group
BEFORE INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.create_event_group();

-- ============================================================
-- 3. Event participants ↔ group members synchronisation
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_participant_to_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id FROM public.events WHERE id = NEW.event_id;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'cancelled' THEN
      INSERT INTO public.group_members (group_id, user_id)
      VALUES (v_group_id, NEW.user_id)
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      DELETE FROM public.group_members
      WHERE group_id = v_group_id AND user_id = NEW.user_id;
    ELSIF NEW.status <> 'cancelled' AND OLD.status = 'cancelled' THEN
      INSERT INTO public.group_members (group_id, user_id)
      VALUES (v_group_id, NEW.user_id)
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_participants_sync_group ON public.event_participants;
CREATE TRIGGER event_participants_sync_group
AFTER INSERT OR UPDATE OF status ON public.event_participants
FOR EACH ROW
EXECUTE FUNCTION public.sync_participant_to_group();

-- ============================================================
-- 4. Backfill: existing events get a group + existing participants
--    become group members.
-- ============================================================

DO $$
DECLARE
  e RECORD;
  v_group_id uuid;
  v_min_size int;
  v_max_size int;
BEGIN
  FOR e IN SELECT * FROM public.events WHERE group_id IS NULL LOOP
    v_max_size := GREATEST(e.participant_limit, 2);
    v_min_size := LEAST(2, v_max_size);

    INSERT INTO public.groups (sport, status, captain_id, min_size, max_size, event_id)
    VALUES (e.sport, 'pending', e.organizer_id, v_min_size, v_max_size, e.id)
    RETURNING id INTO v_group_id;

    UPDATE public.events SET group_id = v_group_id WHERE id = e.id;

    INSERT INTO public.group_members (group_id, user_id)
    SELECT v_group_id, ep.user_id
    FROM public.event_participants ep
    WHERE ep.event_id = e.id AND ep.status <> 'cancelled'
    ON CONFLICT (group_id, user_id) DO NOTHING;

    -- Make sure the organizer is always a group member, even if they
    -- aren't listed in event_participants yet.
    INSERT INTO public.group_members (group_id, user_id)
    VALUES (v_group_id, e.organizer_id)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END LOOP;
END$$;
