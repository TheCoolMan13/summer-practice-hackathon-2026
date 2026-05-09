-- Migration: RPC function for re-engagement user detection
-- Requirements: 15.1, 15.4
--
-- This function efficiently queries users who:
-- 1. Have no availability record in the last N days OR their last availability is older than N days
-- 2. Have not received a re-engagement notification within the rate limit window
-- 3. Are not currently suppressed (7-day suppression after declaring availability)

-- ============================================================
-- Function: get_inactive_users_for_reengagement
-- Returns users eligible for re-engagement notifications
-- ============================================================
CREATE OR REPLACE FUNCTION get_inactive_users_for_reengagement(
  inactivity_cutoff TIMESTAMPTZ,
  rate_limit_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  user_id UUID,
  sports TEXT[],
  last_activity_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH last_availability AS (
    SELECT
      a.user_id,
      MAX(a.created_at) AS last_avail_date
    FROM availability a
    GROUP BY a.user_id
  ),
  last_reengagement_notif AS (
    SELECT
      n.user_id,
      MAX(n.created_at) AS last_notif_date
    FROM notifications n
    WHERE n.type = 're_engagement'
    GROUP BY n.user_id
  ),
  user_sports_agg AS (
    SELECT
      us.user_id,
      ARRAY_AGG(us.sport) AS sports
    FROM user_sports us
    GROUP BY us.user_id
  )
  SELECT
    p.id AS user_id,
    COALESCE(usa.sports, ARRAY[]::TEXT[]) AS sports,
    la.last_avail_date AS last_activity_date
  FROM profiles p
  LEFT JOIN last_availability la ON la.user_id = p.id
  LEFT JOIN last_reengagement_notif lrn ON lrn.user_id = p.id
  LEFT JOIN user_sports_agg usa ON usa.user_id = p.id
  WHERE
    -- User has no availability OR last availability is older than inactivity cutoff
    (la.last_avail_date IS NULL OR la.last_avail_date < inactivity_cutoff)
    -- User has not received a re-engagement notification within rate limit window
    AND (lrn.last_notif_date IS NULL OR lrn.last_notif_date < rate_limit_cutoff)
    -- User has at least one sport preference (optional filter)
    AND usa.sports IS NOT NULL
    AND ARRAY_LENGTH(usa.sports, 1) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION get_inactive_users_for_reengagement(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
