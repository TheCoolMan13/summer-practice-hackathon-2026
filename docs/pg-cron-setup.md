# pg_cron Setup Guide for ShowUp2Move

This guide explains how to set up and verify the pg_cron schedules for the ShowUp2Move platform.

## Overview

The platform uses pg_cron to automatically run two Edge Functions on a schedule:

1. **expire-availability**: Runs every 1 minute to expire old availability declarations
2. **match-users**: Runs every 5 minutes to match available users into groups

## Prerequisites

- Supabase project is created and accessible
- Database migrations have been applied (including `20240001000006_pg_cron_schedules.sql`)
- Edge Functions are deployed (`match-users` and `expire-availability`)

## Setup Steps

### Step 1: Verify Extensions are Enabled

Run the following SQL in the Supabase SQL Editor:

```sql
-- Check pg_cron extension
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check pg_net extension (required for HTTP calls)
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

If either extension is missing, enable it:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### Step 2: Configure Database Settings

The pg_cron schedules need to know your Supabase URL and service role key to call the Edge Functions.

#### Get Your Service Role Key

1. Go to your Supabase dashboard
2. Navigate to: **Settings → API**
3. Copy the **service_role** key (NOT the anon/public key)
4. ⚠️ **Keep this key secret** - it bypasses Row Level Security

#### Set Database Configuration

Run the following SQL in the Supabase SQL Editor, replacing `<your-service-role-key>` with your actual key:

```sql
-- For production
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://hdmqkrkzxnqvchgccthl.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>';
```

### Step 3: Verify Schedules are Active

Run the verification script:

```sql
-- Check if schedules exist and are active
SELECT 
  jobid,
  jobname,
  schedule,
  active
FROM cron.job 
WHERE jobname IN ('match-users-every-5-minutes', 'expire-availability-every-minute');
```

Expected output:
```
jobid | jobname                           | schedule      | active
------|-----------------------------------|---------------|-------
1     | expire-availability-every-minute  | * * * * *     | t
2     | match-users-every-5-minutes       | */5 * * * *   | t
```

### Step 4: Verify Edge Functions are Deployed

1. Go to Supabase dashboard
2. Navigate to: **Edge Functions**
3. Verify both functions are listed:
   - `match-users`
   - `expire-availability`

If not deployed, deploy them:

```bash
# Deploy match-users
supabase functions deploy match-users

# Deploy expire-availability
supabase functions deploy expire-availability
```

### Step 5: Test Manual Execution

Before waiting for the schedule, test the functions manually:

```bash
# Test match-users
curl -X POST https://hdmqkrkzxnqvchgccthl.supabase.co/functions/v1/match-users \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test expire-availability
curl -X POST https://hdmqkrkzxnqvchgccthl.supabase.co/functions/v1/expire-availability \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (match-users):
```json
{
  "formedGroups": [],
  "queuedUsers": [],
  "createdGroupIds": []
}
```

### Step 6: Monitor Execution

Check the execution history:

```sql
-- Check recent match-users executions
SELECT 
  jobname,
  status,
  return_message,
  start_time,
  end_time - start_time as duration
FROM cron.job_run_details jrd
JOIN cron.job j ON jrd.jobid = j.jobid
WHERE j.jobname = 'match-users-every-5-minutes'
ORDER BY start_time DESC
LIMIT 10;
```

Check Edge Function logs in the dashboard:
1. Navigate to: **Edge Functions → match-users → Logs**
2. Look for successful executions and any errors

## Verification Checklist

Use this checklist to ensure everything is set up correctly:

- [ ] pg_cron extension is enabled
- [ ] pg_net extension is enabled
- [ ] Database settings are configured (supabase_url and service_role_key)
- [ ] Both schedules exist in `cron.job` table
- [ ] Both schedules are active (`active = true`)
- [ ] Edge Functions are deployed
- [ ] Manual function execution succeeds
- [ ] Scheduled executions appear in `cron.job_run_details`
- [ ] Edge Function logs show successful executions

## Troubleshooting

### Schedule Not Running

**Symptom**: No entries in `cron.job_run_details` after 5+ minutes

**Solutions**:
1. Verify database settings are configured (Step 2)
2. Check if Edge Functions are deployed (Step 4)
3. Check Edge Function logs for errors
4. Manually trigger the function to test (Step 5)

### Function Returns Error

**Symptom**: `status = 'failed'` in `cron.job_run_details`

**Solutions**:
1. Check Edge Function logs for detailed error messages
2. Verify environment variables are set in Edge Function settings
3. Check database connectivity from Edge Function
4. Verify service role key is correct

### No Groups Being Created

**Symptom**: Function runs successfully but no groups are created

**Possible causes**:
1. No users have active availability declarations
2. Not enough users for minimum group size
3. Users are too far apart (>10 km)
4. Skill levels are incompatible

**Debug**:
```sql
-- Check active availability
SELECT COUNT(*) FROM availability WHERE is_available = true AND expires_at > NOW();

-- Check availability by sport
SELECT sport, COUNT(*) 
FROM availability a
JOIN availability_sports s ON a.id = s.availability_id
WHERE a.is_available = true AND a.expires_at > NOW()
GROUP BY sport;

-- Check user locations
SELECT COUNT(*) FROM profiles WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
```

### AI Integration Issues

**Symptom**: Warning logs about AI unavailability

**Solutions**:
1. This is expected behavior when AI microservice is not running
2. The matching engine will continue without AI scores (graceful degradation)
3. To enable AI: Set `AI_BASE_URL` environment variable in Edge Function settings
4. Deploy and configure the AI microservice

## Schedule Details

### match-users Schedule

- **Frequency**: Every 5 minutes (`*/5 * * * *`)
- **Purpose**: Match available users into groups
- **Requirements**: 7.1
- **Execution time**: Target ≤ 5 seconds
- **Dependencies**: 
  - `availability` table with active records
  - `profiles` table with location data
  - `user_sports` table with skill levels

### expire-availability Schedule

- **Frequency**: Every 1 minute (`* * * * *`)
- **Purpose**: Expire old availability declarations
- **Requirements**: 6.4, 16.5
- **Execution time**: Target ≤ 1 second
- **Dependencies**:
  - `availability` table with expired records

## Monitoring Best Practices

1. **Check execution history daily**:
   ```sql
   SELECT 
     jobname,
     COUNT(*) as total_runs,
     SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful,
     SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
     AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_seconds
   FROM cron.job_run_details jrd
   JOIN cron.job j ON jrd.jobid = j.jobid
   WHERE start_time > NOW() - INTERVAL '24 hours'
   GROUP BY jobname;
   ```

2. **Monitor Edge Function logs** for errors and warnings

3. **Track matching success rate**:
   ```sql
   -- Groups created in last 24 hours
   SELECT COUNT(*) FROM groups WHERE created_at > NOW() - INTERVAL '24 hours';
   
   -- Users queued in last 24 hours
   SELECT COUNT(*) FROM matching_queue WHERE queued_at > NOW() - INTERVAL '24 hours';
   ```

4. **Set up alerts** for:
   - Failed pg_cron executions
   - Edge Function errors
   - Long execution times (>5 seconds for match-users)

## Security Notes

- **Service role key**: Keep this secret. It bypasses all Row Level Security policies.
- **Database settings**: These are stored in the database and accessible to all database users. Do not store other sensitive data in `app.settings.*`.
- **Edge Function logs**: May contain sensitive data. Restrict access to authorized personnel only.

## Related Documentation

- [match-users Edge Function README](../supabase/functions/match-users/README.md)
- [expire-availability Edge Function README](../supabase/functions/expire-availability/README.md)
- [pg_cron Migration](../supabase/migrations/20240001000006_pg_cron_schedules.sql)
- [Verification Script](../supabase/verify-pg-cron.sql)

## Support

If you encounter issues not covered in this guide:

1. Check the Supabase documentation: https://supabase.com/docs/guides/database/extensions/pg_cron
2. Review Edge Function logs for detailed error messages
3. Run the verification script: `supabase/verify-pg-cron.sql`
4. Check the project's issue tracker or contact the development team
