-- Verification script for pg_cron schedules
-- Run this in the Supabase SQL Editor to verify the match-users schedule is active

-- ============================================================
-- 1. Check if pg_cron extension is enabled
-- ============================================================
SELECT 
  extname,
  extversion,
  'pg_cron extension is installed' as status
FROM pg_extension 
WHERE extname = 'pg_cron';

-- Expected: One row with extname = 'pg_cron'
-- If no rows: Run "CREATE EXTENSION IF NOT EXISTS pg_cron;" first

-- ============================================================
-- 2. Check if pg_net extension is enabled (required for HTTP calls)
-- ============================================================
SELECT 
  extname,
  extversion,
  'pg_net extension is installed' as status
FROM pg_extension 
WHERE extname = 'pg_net';

-- Expected: One row with extname = 'pg_net'
-- If no rows: Run "CREATE EXTENSION IF NOT EXISTS pg_net;" first

-- ============================================================
-- 3. Check if database settings are configured
-- ============================================================
SELECT 
  name,
  setting,
  CASE 
    WHEN name = 'app.settings.supabase_url' AND setting IS NOT NULL 
      THEN 'Supabase URL is configured'
    WHEN name = 'app.settings.service_role_key' AND setting IS NOT NULL 
      THEN 'Service role key is configured'
    ELSE 'NOT CONFIGURED - See instructions below'
  END as status
FROM pg_settings
WHERE name IN ('app.settings.supabase_url', 'app.settings.service_role_key');

-- Expected: Two rows with non-null settings
-- If missing, run the configuration commands below

-- ============================================================
-- 4. Check if match-users schedule exists
-- ============================================================
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active,
  CASE 
    WHEN active THEN 'Schedule is ACTIVE'
    ELSE 'Schedule is INACTIVE'
  END as status
FROM cron.job 
WHERE jobname = 'match-users-every-5-minutes';

-- Expected: One row with jobname = 'match-users-every-5-minutes' and active = true
-- If no rows: The migration has not been applied yet

-- ============================================================
-- 5. Check if expire-availability schedule exists
-- ============================================================
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active,
  CASE 
    WHEN active THEN 'Schedule is ACTIVE'
    ELSE 'Schedule is INACTIVE'
  END as status
FROM cron.job 
WHERE jobname = 'expire-availability-every-minute';

-- Expected: One row with jobname = 'expire-availability-every-minute' and active = true

-- ============================================================
-- 6. Check recent job execution history for match-users
-- ============================================================
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time,
  end_time - start_time as duration
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'match-users-every-5-minutes')
ORDER BY start_time DESC
LIMIT 10;

-- Expected: Rows showing recent executions (if the schedule has run)
-- Status should be 'succeeded' for successful runs
-- If no rows: The schedule hasn't run yet (wait up to 5 minutes)

-- ============================================================
-- 7. Check recent job execution history for expire-availability
-- ============================================================
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time,
  end_time - start_time as duration
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'expire-availability-every-minute')
ORDER BY start_time DESC
LIMIT 10;

-- Expected: Rows showing recent executions (if the schedule has run)

-- ============================================================
-- CONFIGURATION INSTRUCTIONS
-- ============================================================
-- If the database settings are not configured, run these commands:
--
-- For production (Supabase dashboard):
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://hdmqkrkzxnqvchgccthl.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>';
--
-- To find your service role key:
--   1. Go to Supabase dashboard
--   2. Navigate to: Settings → API
--   3. Copy the "service_role" key (NOT the anon/public key)
--
-- After setting the configuration, the pg_cron jobs will start running automatically.
-- ============================================================

-- ============================================================
-- TROUBLESHOOTING
-- ============================================================
-- If schedules are not running:
--
-- 1. Check if extensions are enabled (queries 1 and 2 above)
-- 2. Check if database settings are configured (query 3 above)
-- 3. Check if Edge Functions are deployed:
--    - Go to Supabase dashboard → Edge Functions
--    - Verify "match-users" and "expire-availability" are listed
-- 4. Check Edge Function logs for errors:
--    - Dashboard → Edge Functions → [function name] → Logs
-- 5. Manually trigger the function to test:
--    curl -X POST https://hdmqkrkzxnqvchgccthl.supabase.co/functions/v1/match-users \
--      -H "Authorization: Bearer <service-role-key>" \
--      -H "Content-Type: application/json" \
--      -d '{}'
-- ============================================================
