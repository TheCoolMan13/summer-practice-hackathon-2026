-- Migration: pg_cron schedules for Edge Functions
-- Requirements: 6.4, 16.5 (expire-availability), 7.1 (match-users), 8.4, 16.4 (reassign-captain)

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Schedule: expire-availability
-- Runs every 1 minute to mark expired availability records
-- as unavailable, remove them from matching_queue, and notify users.
-- Requirements: 6.4, 16.5
-- ============================================================
SELECT cron.schedule(
  'expire-availability-every-minute',
  '* * * * *',  -- Every minute
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/expire-availability',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ============================================================
-- Schedule: match-users
-- Runs every 5 minutes to execute the matching engine.
-- Requirement: 7.1
-- ============================================================
SELECT cron.schedule(
  'match-users-every-5-minutes',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/match-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ============================================================
-- Schedule: reassign-captain
-- Runs every 15 minutes to check for inactive captains (>2h without confirmation)
-- and reassign the captain role to another eligible group member.
-- Requirements: 8.4, 16.4
-- ============================================================
SELECT cron.schedule(
  'reassign-captain-every-15-minutes',
  '*/15 * * * *',  -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/reassign-captain',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ============================================================
-- Schedule: reengage-users
-- Runs daily at 10:00 AM UTC to identify inactive users (≥5 days without
-- availability declaration) and send personalized re-engagement reminders.
-- Requirements: 15.1, 15.2, 15.3, 15.4
-- ============================================================
SELECT cron.schedule(
  'reengage-users-daily',
  '0 10 * * *',  -- Daily at 10:00 AM UTC
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/reengage-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ============================================================
-- Configuration Instructions
-- ============================================================
-- The pg_cron schedules require the following database settings:
--
-- For local development (run after `supabase start`):
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'http://127.0.0.1:54321';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<your-local-service-role-key>';
--
-- For production (run via Supabase dashboard SQL editor):
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>';
--
-- Note: The service role key can be found in:
--   - Local: Output of `supabase status` or `.env` file
--   - Production: Supabase dashboard → Settings → API → service_role key
-- ============================================================

-- ============================================================
-- Schedule: send-reminders
-- Runs every hour to send reminder notifications for events
-- starting within the next hour.
-- Requirement: 12.5
-- ============================================================
SELECT cron.schedule(
  'send-reminders-every-hour',
  '0 * * * *',  -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
