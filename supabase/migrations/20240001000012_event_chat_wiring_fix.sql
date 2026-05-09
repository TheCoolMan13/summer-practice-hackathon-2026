-- Migration: fix FK ordering in the event → group creation trigger.
--
-- The trigger added in 20240001000011_event_chat_wiring.sql inserted a
-- `groups` row with `event_id = NEW.id` during a BEFORE INSERT trigger on
-- `events`. At that moment the events row has not been written yet, so the
-- non-deferrable FK `groups_event_id_fkey` (groups.event_id → events.id)
-- rejects the insert and PostgREST returns HTTP 409 on `POST /events`.
--
-- Fix:
--   1. BEFORE INSERT trigger creates the group with `event_id = NULL` and
--      sets `NEW.group_id`.
--   2. AFTER  INSERT trigger links the group back to the event via
--      `UPDATE groups SET event_id = NEW.id`.

-- --------------------------------------------------------------
-- 1. Rewritten BEFORE INSERT trigger: no event_id reference yet.
-- --------------------------------------------------------------

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

  -- IMPORTANT: do NOT set event_id here. The events row does not exist
  -- yet; the FK would reject the insert. The AFTER INSERT trigger below
  -- writes event_id once the event row has been persisted.
  INSERT INTO public.groups (sport, status, captain_id, min_size, max_size)
  VALUES (NEW.sport, 'pending', NEW.organizer_id, v_min_size, v_max_size)
  RETURNING id INTO v_group_id;

  NEW.group_id := v_group_id;
  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------
-- 2. New AFTER INSERT trigger: link groups.event_id -> events.id.
-- --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_group_to_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE public.groups SET event_id = NEW.id WHERE id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_link_group ON public.events;
CREATE TRIGGER events_link_group
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.link_group_to_event();

-- --------------------------------------------------------------
-- 3. Backfill: any groups created by the broken BEFORE INSERT trigger
--    (those that somehow did get through with event_id IS NULL while a
--    matching event exists) get linked up.
-- --------------------------------------------------------------

UPDATE public.groups g
SET event_id = e.id
FROM public.events e
WHERE e.group_id = g.id
  AND g.event_id IS NULL;
